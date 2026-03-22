import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100">
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-bold text-brand-800">Coffee Shop Manager</h1>
        <p className="text-lg text-brand-600">Hệ thống quản lý quán cà phê</p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/menu?tableId=demo"
            className="rounded-xl bg-brand-600 px-8 py-3 text-white font-semibold hover:bg-brand-700 transition"
          >
            Xem Menu (Khách)
          </Link>
          <Link
            href="/staff/login"
            className="rounded-xl border-2 border-brand-600 px-8 py-3 text-brand-700 font-semibold hover:bg-brand-50 transition"
          >
            Nhân viên
          </Link>
        </div>
      </div>
    </div>
  )
}
