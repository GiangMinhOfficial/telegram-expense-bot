import { describe, expect, it } from 'vitest';
import { classifyDeviceCode } from '../src/graph/device';

const NOW = Date.UTC(2026, 8, 1, 5, 0);

/**
 * Bảng mã lỗi lấy từ mục "Expected errors" của tài liệu device authorization
 * grant. Đây là phần duy nhất của luồng cấp quyền lại thuần logic, nên cũng là
 * phần duy nhất kiểm được mà không dựng Env hay giả lập fetch.
 */
describe('classifyDeviceCode', () => {
  it('đủ cả hai token thì là xong', () =>
    expect(classifyDeviceCode(
      { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }, NOW,
    )).toEqual({
      kind: 'ok', accessToken: 'AT', refreshToken: 'RT', expiresAt: NOW + 3_600_000,
    }));

  it('thiếu expires_in thì coi như một giờ', () => {
    const r = classifyDeviceCode({ access_token: 'AT', refresh_token: 'RT' }, NOW);
    expect(r).toMatchObject({ kind: 'ok', expiresAt: NOW + 3_600_000 });
  });

  it('có access_token mà thiếu refresh_token thì KHÔNG tính là xong', () =>
    // Không giữ được refresh token thì lần sau bot lại chết; thà báo lạ còn hơn
    // báo thành công rồi hỏng âm thầm.
    expect(classifyDeviceCode({ access_token: 'AT' }, NOW).kind).toBe('unknown'));

  it('người dùng chưa đăng nhập xong → pending', () =>
    expect(classifyDeviceCode({ error: 'authorization_pending' }, NOW))
      .toEqual({ kind: 'pending' }));

  it('slow_down cũng là pending chứ không phải lỗi lạ', () =>
    expect(classifyDeviceCode({ error: 'slow_down' }, NOW)).toEqual({ kind: 'pending' }));

  it('người dùng bấm từ chối → declined', () =>
    expect(classifyDeviceCode({ error: 'authorization_declined' }, NOW))
      .toEqual({ kind: 'declined' }));

  it('quá hạn 15 phút → expired', () =>
    expect(classifyDeviceCode({ error: 'expired_token' }, NOW)).toEqual({ kind: 'expired' }));

  it('mã không được nhận ra → bad_code', () =>
    expect(classifyDeviceCode({ error: 'bad_verification_code' }, NOW))
      .toEqual({ kind: 'bad_code' }));

  it('lỗi ngoài bảng thì giữ nguyên văn để còn chẩn đoán', () =>
    expect(classifyDeviceCode(
      { error: 'invalid_client', error_description: 'AADSTS70002: ... marked as mobile' }, NOW,
    )).toEqual({ kind: 'unknown', error: 'AADSTS70002: ... marked as mobile' }));

  it('lỗi trống rỗng vẫn ra unknown chứ không ném', () =>
    expect(classifyDeviceCode({}, NOW).kind).toBe('unknown'));
});
