import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, CheckSquare, FileCheck, Settings } from 'lucide-react';
import DashboardTab from './admin/DashboardTab';
import KaryawanTab from './admin/KaryawanTab';
import AbsensiTab from './admin/AbsensiTab';
import ApprovalTab from './admin/ApprovalTab';
import PengaturanTab from './admin/PengaturanTab';

export default function AdminDashboard() {
  const { dbUser } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'karyawan', name: 'Karyawan', icon: Users },
    { id: 'absensi', name: 'Absensi', icon: CheckSquare },
    { id: 'approval', name: 'Approval', icon: FileCheck },
    { id: 'pengaturan', name: 'Pengaturan', icon: Settings },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 shrink-0">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 lg:p-4 sticky top-6">
                <h2 className="text-lg font-bold text-slate-800 mb-3 px-2 hidden lg:block">Menu Admin</h2>
                <nav className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible gap-2 pb-2 lg:pb-0 hide-scrollbar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-none flex items-center space-x-2 lg:space-x-3 px-4 py-2.5 lg:py-3 rounded-xl transition-colors text-sm lg:text-base whitespace-nowrap ${
                                activeTab === tab.id
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <tab.icon size={18} className="lg:w-5 lg:h-5" />
                            <span>{tab.name}</span>
                        </button>
                    ))}
                </nav>
            </div>
        </div>

        <div className="flex-1 min-w-0">
            {activeTab === 'dashboard' && <DashboardTab />}
            {activeTab === 'karyawan' && <KaryawanTab />}
            {activeTab === 'absensi' && <AbsensiTab />}
            {activeTab === 'approval' && <ApprovalTab />}
            {activeTab === 'pengaturan' && <PengaturanTab />}
        </div>
    </div>
  );
}
