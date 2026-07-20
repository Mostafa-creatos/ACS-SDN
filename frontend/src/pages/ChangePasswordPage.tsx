import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Key } from 'lucide-react';

export const ChangePasswordPage: React.FC = () => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const { logout } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await changePassword({ current_password: currentPassword, new_password: newPassword });
            // Refresh the token to get updated must_change_password=false
            const refreshToken = localStorage.getItem('atlas_refresh');
            if (refreshToken) {
                const res = await fetch('/api/v5/auth/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken })
                });
                if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem('atlas_jwt', data.access_token);
                    if (data.refresh_token) localStorage.setItem('atlas_refresh', data.refresh_token);
                    window.location.href = '/dashboard';
                    return;
                }
            }
            // Fallback: logout and let them re-login
            logout();
            navigate('/login');
        } catch (err) {
            alert("Failed to change password. Please check your current password.");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-200">
                <div className="flex justify-center mb-6">
                    <div className="w-12 h-12 bg-atlas-teal/10 rounded-full flex items-center justify-center text-atlas-teal">
                        <Key className="w-6 h-6" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-center mb-2">Change Password</h2>
                <p className="text-slate-500 text-center text-sm mb-6">For security reasons, you must change your password before continuing.</p>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Current Password</label>
                        <input 
                            type="password" 
                            className="w-full border-slate-300 rounded-lg shadow-sm focus:border-atlas-teal focus:ring-atlas-teal"
                            value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">New Password</label>
                        <input 
                            type="password" 
                            className="w-full border-slate-300 rounded-lg shadow-sm focus:border-atlas-teal focus:ring-atlas-teal"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="w-full bg-atlas-teal text-white py-2 rounded-lg font-medium hover:bg-teal-600 transition">
                        Update Password
                    </button>
                </form>
            </div>
        </div>
    );
};
