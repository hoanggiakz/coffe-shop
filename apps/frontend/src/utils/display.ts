export function vaiTroNhanVien(role?: string | null): string {
  switch (role) {
    case 'ADMIN':
      return 'Quản trị hệ thống'
    case 'MANAGER':
      return 'Quản lý'
    case 'WAITER':
      return 'Phục vụ'
    case 'BARISTA':
      return 'Pha chế'
    case 'STAFF':
      return 'Nhân viên'
    default:
      return role || 'Nhân viên'
  }
}

export function caLamViec(shift?: string | null): string {
  switch (shift) {
    case 'MORNING':
      return 'Ca sáng'
    case 'AFTERNOON':
      return 'Ca chiều'
    case 'EVENING':
      return 'Ca tối'
    default:
      return shift || '-'
  }
}

export function phuongThucChamCong(method?: string | null): string {
  switch (method) {
    case 'EMPLOYEE_CODE':
      return 'Mã nhân viên'
    case 'QR':
      return 'Mã QR'
    default:
      return method || '-'
  }
}

export function trangThaiBan(status?: string | null): string {
  switch (status) {
    case 'AVAILABLE':
      return 'Trống'
    case 'OCCUPIED':
      return 'Đang sử dụng'
    case 'RESERVED':
      return 'Đã đặt trước'
    case 'CLEANING':
      return 'Đang dọn'
    case 'MAINTENANCE':
      return 'Bảo trì'
    default:
      return status || '-'
  }
}

export function trangThaiDonHang(status?: string | null): string {
  switch (status) {
    case 'PENDING':
      return 'Chờ xác nhận'
    case 'CONFIRMED':
      return 'Đã xác nhận'
    case 'PREPARING':
      return 'Đang chuẩn bị'
    case 'READY':
      return 'Sẵn sàng phục vụ'
    case 'COMPLETED':
      return 'Hoàn thành'
    case 'CANCELLED':
      return 'Đã hủy'
    default:
      return status || '-'
  }
}

export function phamViKhuyenMai(scope?: string | null): string {
  switch (scope) {
    case 'ORDER':
      return 'Toàn đơn'
    case 'ITEM':
      return 'Món cụ thể'
    default:
      return scope || '-'
  }
}

export function loaiGiamGia(type?: string | null): string {
  switch (type) {
    case 'PERCENT':
      return 'Phần trăm'
    case 'FIXED':
      return 'Số tiền cố định'
    default:
      return type || '-'
  }
}

export function trangThaiHoatDong(active?: boolean): string {
  return active ? 'Đang hoạt động' : 'Ngừng hoạt động'
}

export function phuongThucThanhToan(method?: string | null): string {
  switch (method) {
    case 'CASH':
      return 'Tiền mặt'
    case 'SEPAY':
      return 'SePay'
    default:
      return method || '-'
  }
}

export function trangThaiThanhToan(status?: string | null): string {
  switch (status) {
    case 'PENDING':
      return 'Đang chờ'
    case 'WAITING_TRANSFER':
      return 'Chờ chuyển khoản'
    case 'WAITING_CASH':
      return 'Chờ thu tiền mặt'
    case 'PAID':
      return 'Đã thanh toán'
    case 'COMPLETED':
      return 'Hoàn tất'
    case 'FAILED':
      return 'Thất bại'
    case 'EXPIRED':
      return 'Hết hạn'
    case 'CANCELLED':
      return 'Đã hủy'
    case 'REFUNDED':
      return 'Đã hoàn tiền'
    default:
      return status || '-'
  }
}

export function loaiTuyChonMon(type?: string | null): string {
  switch (type) {
    case 'SINGLE':
      return 'Chọn một'
    case 'MULTI':
      return 'Chọn nhiều'
    case 'TEXT':
      return 'Nhập nội dung'
    default:
      return type || '-'
  }
}

export function maDonHangNgan(orderId?: string | null, prefix = 'ĐH'): string {
  const raw = String(orderId || '').trim()
  if (!raw) return '-'

  if (raw.length <= 12 && /^[a-zA-Z0-9-]+$/.test(raw)) {
    return raw.toUpperCase()
  }

  const compact = raw.replace(/[^a-zA-Z0-9]/g, '')
  const tail = (compact || raw).slice(-6).toUpperCase()
  return `${prefix}-${tail}`
}
