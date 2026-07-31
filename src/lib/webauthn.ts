// WebAuthn Biometric API Helper (Fingerprint / Face ID / Touch ID / Passkey)

export interface BiometricSupportInfo {
  isSupported: boolean;
  isPlatformAvailable: boolean;
  message?: string;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function isInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch (e) {
    return true;
  }
}

/**
  Check if WebAuthn and Biometric Sensor are supported on this device/browser
 */
export async function checkBiometricSupport(): Promise<BiometricSupportInfo> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return {
      isSupported: false,
      isPlatformAvailable: false,
      message: 'Perangkat atau browser Anda belum mendukung standar WebAuthn / Biometrik.'
    };
  }

  const inIframe = isInIframe();

  try {
    const isPlatformAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return {
      isSupported: true,
      isPlatformAvailable: isPlatformAvailable,
      message: inIframe
        ? 'Sensor Biometrik siap. Catatan: Apabila menggunakan iFrame pratinjau, disarankan me-buka di Tab Baru.'
        : isPlatformAvailable 
          ? 'Sensor Biometrik (Fingerprint / Face ID) tersedia dan siap digunakan.'
          : 'Perangkat mendukung WebAuthn (Passkey) via sensor atau Kunci Keamanan.'
    };
  } catch (e) {
    return {
      isSupported: true,
      isPlatformAvailable: false,
      message: 'WebAuthn didukung, namun pemeriksaan sensor biometrik terbatas.'
    };
  }
}

/**
  Register new Biometric credential for current user
 */
export async function registerBiometricCredential(
  userId: string,
  userName: string,
  displayName: string
): Promise<{ credentialId: string; rawId: string }> {
  if (isInIframe()) {
    throw new Error('Fitur Biometrik dibatasi oleh iFrame pratinjau. Silakan klik "Buka di Tab Baru" untuk mendaftarkan sidik jari/wajah.');
  }

  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn tidak didukung oleh browser Anda.');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBuffer = new TextEncoder().encode(userId);

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: challenge,
    rp: {
      name: 'Absensi Online US BILIBILI 162',
      id: window.location.hostname
    },
    user: {
      id: userIdBuffer,
      name: userName || userId,
      displayName: displayName || userName || 'User US BILIBILI 162'
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },   // ES256 (Primary)
      { alg: -257, type: 'public-key' }, // RS256
      { alg: -8, type: 'public-key' }    // Ed25519
    ],
    authenticatorSelection: {
      userVerification: 'required',
      residentKey: 'preferred'
    },
    timeout: 60000,
    attestation: 'none'
  };

  try {
    const credential = (await navigator.credentials.create({
      publicKey: publicKeyOptions
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error('Pendaftaran Biometrik dibatalkan.');
    }

    const credentialId = credential.id;
    const rawId = bufferToBase64Url(credential.rawId);

    // Store in localStorage backup for offline/fast access
    localStorage.setItem(`biometric_cred_${userId}`, credentialId);

    return {
      credentialId,
      rawId
    };
  } catch (err: any) {
    console.error('[WebAuthn] Register error:', err);
    const errStr = String(err?.message || err).toLowerCase();

    if (errStr.includes('publickey-credentials') || errStr.includes('not enabled') || errStr.includes('permissions policy') || err?.name === 'SecurityError') {
      throw new Error('Fitur Biometrik dibatasi oleh iFrame pratinjau. Silakan klik "Buka di Tab Baru" untuk memindai sidik jari/wajah.');
    } else if (err.name === 'NotAllowedError') {
      throw new Error('Verifikasi Biometrik dibatalkan atau ditolak oleh pengguna.');
    } else if (err.name === 'InvalidStateError') {
      throw new Error('Biometrik/Passkey sudah pernah terdaftar untuk akun ini.');
    } else {
      throw new Error(err.message || 'Gagal mendaftarkan Biometrik/Fingerprint pada perangkat.');
    }
  }
}

/**
  Authenticate user using registered Biometric / Passkey credential
 */
export async function authenticateBiometricCredential(
  storedCredentialId?: string
): Promise<{ success: boolean; credentialId: string }> {
  if (isInIframe()) {
    throw new Error('Fitur Biometrik dibatasi oleh iFrame pratinjau. Silakan klik "Buka di Tab Baru" untuk memindai sidik jari/wajah.');
  }

  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn tidak didukung oleh browser Anda.');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const requestOptions: PublicKeyCredentialRequestOptions = {
    challenge: challenge,
    timeout: 60000,
    userVerification: 'required',
    rpId: window.location.hostname
  };

  if (storedCredentialId) {
    try {
      requestOptions.allowCredentials = [
        {
          id: base64UrlToBuffer(storedCredentialId),
          type: 'public-key'
        }
      ];
    } catch (e) {
      console.warn('[WebAuthn] Could not parse stored credential ID, fallback to broad prompt:', e);
    }
  }

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: requestOptions
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('Autentikasi Biometrik dibatalkan.');
    }

    return {
      success: true,
      credentialId: assertion.id
    };
  } catch (err: any) {
    console.error('[WebAuthn] Authenticate error:', err);
    const errStr = String(err?.message || err).toLowerCase();

    if (errStr.includes('publickey-credentials') || errStr.includes('not enabled') || errStr.includes('permissions policy') || err?.name === 'SecurityError') {
      throw new Error('Fitur Biometrik dibatasi oleh iFrame pratinjau. Silakan klik "Buka di Tab Baru" untuk memindai sidik jari/wajah.');
    } else if (err.name === 'NotAllowedError') {
      throw new Error('Pindaian Biometrik (Fingerprint/Face ID) dibatalkan atau tidak cocok.');
    } else {
      throw new Error(err.message || 'Gagal memverifikasi sensor Biometrik/Fingerprint.');
    }
  }
}
