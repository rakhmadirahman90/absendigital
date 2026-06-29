/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CheckInOut from './pages/CheckInOut';
import History from './pages/History';
import Submissions from './pages/Submissions';
import AdminDashboardTab from './pages/admin/DashboardTab';
import KaryawanTab from './pages/admin/KaryawanTab';
import AbsensiTab from './pages/admin/AbsensiTab';
import ApprovalTab from './pages/admin/ApprovalTab';
import PengaturanTab from './pages/admin/PengaturanTab';
import Layout from './components/Layout';

const ProtectedRoute = ({ 
  children, 
  adminOnly = false, 
  userOnly = false 
}: { 
  children: React.ReactNode, 
  adminOnly?: boolean, 
  userOnly?: boolean 
}) => {
  const { user, dbUser } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && dbUser?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  if (userOnly && dbUser?.role === 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const DashboardWrapper = () => {
  const { dbUser } = useAuth();
  if (dbUser?.role === 'admin') {
    return <AdminDashboardTab />;
  }
  return <Dashboard />;
};

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<DashboardWrapper />} />
            <Route path="/checkinout" element={<ProtectedRoute userOnly><CheckInOut /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute userOnly><History /></ProtectedRoute>} />
            <Route path="/submissions" element={<ProtectedRoute userOnly><Submissions /></ProtectedRoute>} />
            <Route path="/admin/karyawan" element={<ProtectedRoute adminOnly><KaryawanTab /></ProtectedRoute>} />
            <Route path="/admin/absensi" element={<ProtectedRoute adminOnly><AbsensiTab /></ProtectedRoute>} />
            <Route path="/admin/approval" element={<ProtectedRoute adminOnly><ApprovalTab /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute adminOnly><PengaturanTab /></ProtectedRoute>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

