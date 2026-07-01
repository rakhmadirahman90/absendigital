import React from 'react';
// @ts-ignore
import logoLocal from '../assets/logo.png';

interface AppLogoProps {
  className?: string;
  size?: number;
}

export default function AppLogo({ className = "", size = 120 }: AppLogoProps) {
  return (
    <img 
      src={logoLocal} 
      alt="US Bilibili 162 Logo" 
      width={size} 
      height={size} 
      className={`select-none hover:scale-105 transition-transform duration-300 drop-shadow-sm ${className}`}
      style={{ width: size, height: size, objectFit: 'contain' }}
      referrerPolicy="no-referrer"
    />
  );
}
