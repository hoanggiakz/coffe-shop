'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { User } from '@/types';

const NAV_ITEMS = [
  { href: '/staff/dashboard', label: 'Dashboard' },
  { href: '/staff/tables', label: 'Quản lý bàn' },
  { href: '/staff/orders', label: 'Đơn hàng' },
  { href: '/staff/kds', label: 'KDS (Bếp)' },
  { href: '/staff/chat', label: 'Chat' },
];

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      setUser(JSON.parse(stored));
    } else if (!pathname.includes('/login')) {
      router.push('/staff/login');
    }
  }, [pathname, router]);

  // Login page – no sidebar
  if (pathname.includes('/login')) {
    return <>{children}</>;
  }

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/staff/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-60 bg-brand-800 text-white flex flex-col">
        <div className="px-5 py-5 border-b border-brand-700">
          <h2 className="text-lg font-bold">Coffee Shop</h2>
          {user && <p className="text-xs text-brand-200 mt-1">{user.name || user.email}</p>}
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-5 py-2.5 text-sm transition ${
                pathname === item.href
                  ? 'bg-brand-700 font-semibold'
                  : 'hover:bg-brand-700/50'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={logout}
          className="px-5 py-3 text-sm text-brand-200 hover:text-white hover:bg-brand-700 transition border-t border-brand-700"
        >
          Đăng xuất
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
