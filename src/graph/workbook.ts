import type { Env } from '../env';
import { graphFetch } from './client';
import type { RowValues, SheetData } from './sheet';

const item = (env: Env) => `/me/drive/items/${env.DRIVE_ITEM_ID}/workbook`;
const tbl = (env: Env, table: string) =>
  `${item(env)}/tables/${encodeURIComponent(table)}`;

/**
 * Định dạng ngày của các dòng sẵn có trong file. `rows/add` KHÔNG kế thừa định
 * dạng cột Ngày (cột số tiền thì có) — không vá lại thì ô hiện số serial thô
 * "46242". Kiểm chứng ở BƯỚC 0, xem docs/SPIKE-RESULT.md.
 */
const DATE_FORMAT = 'd-mmm';

/** Nối một dòng vào cuối bảng. Trả về chỉ số dòng (0-based) để vá định dạng ngày. */
export async function appendRow(
  env: Env, table: string, values: RowValues,
): Promise<number> {
  const r = (await graphFetch(env, `${tbl(env, table)}/rows/add`, {
    method: 'POST',
    body: JSON.stringify({ values: [values] }),
  })) as { index?: number };
  if (typeof r.index !== 'number') throw new Error('Graph không trả về index của dòng vừa thêm');
  return r.index;
}

/**
 * Vá định dạng cột Ngày cho dòng vừa thêm.
 *
 * `null` ở hai cột kia để giữ nguyên định dạng sẵn có — cột số tiền đã có định
 * dạng tiền tệ VND. Tách khỏi `appendRow` để chạy song song với các lệnh đọc:
 * nó chỉ đổi `numberFormat`, không đụng tới `values`, nên không ảnh hưởng kết
 * quả đọc dù hai lệnh chạy chồng lên nhau.
 */
export async function fixDateFormat(
  env: Env, table: string, index: number,
): Promise<void> {
  await graphFetch(env, `${tbl(env, table)}/rows/itemAt(index=${index})/range`, {
    method: 'PATCH',
    body: JSON.stringify({ numberFormat: [[null, DATE_FORMAT, null]] }),
  });
}

/**
 * Sắp bảng theo cột Ngày tăng dần. Sắp ổn định: cùng ngày giữ thứ tự cũ, định dạng ô đi
 * theo dòng. `key` là chỉ số cột TRONG BẢNG (Ngày = 1) — xem docs/SPIKE-SORT-RESULT.md.
 *
 * Sau lệnh này chỉ số dòng cũ không còn trỏ đúng dòng nữa: mọi lệnh theo chỉ số
 * (`fixDateFormat`) phải xong trước.
 */
export async function sortTableByDate(env: Env, table: string): Promise<void> {
  await graphFetch(env, `${tbl(env, table)}/sort/apply`, {
    method: 'POST',
    body: JSON.stringify({ fields: [{ key: 1, ascending: true }] }),
  });
}

/** Thêm một dòng trống (ba ô null) vào cuối bảng. */
export async function appendBlankRow(env: Env, table: string): Promise<void> {
  await graphFetch(env, `${tbl(env, table)}/rows/add`, {
    method: 'POST',
    body: JSON.stringify({ values: [[null, null, null]] }),
  });
}

export async function deleteRow(env: Env, table: string, index: number): Promise<void> {
  await graphFetch(env, `${tbl(env, table)}/rows/itemAt(index=${index})`, { method: 'DELETE' });
}

/**
 * Đọc mọi dòng dữ liệu của bảng trong một lệnh gọi (không gồm dòng tiêu đề).
 * Chỉ số trong mảng trả về chính là chỉ số dòng của `rows/itemAt` / `deleteRow`.
 * Trả `null` khi không đọc được, để phân biệt với bảng rỗng.
 */
export async function readTableRows(env: Env, table: string): Promise<unknown[][] | null> {
  try {
    const r = (await graphFetch(
      env, `${tbl(env, table)}/dataBodyRange?$select=values`,
    )) as { values?: unknown[][] };
    return r.values ?? null;
  } catch {
    return null;
  }
}

/**
 * Đọc toàn bộ vùng đã dùng của một sheet trong đúng một lệnh gọi.
 * Dùng usedRange chứ không phải vùng cố định: bảng `other` tăng ~50 dòng mỗi
 * tháng nên biên dưới của sheet trôi liên tục.
 */
export async function readSheet(env: Env, sheet: string): Promise<SheetData> {
  const r = (await graphFetch(
    env,
    `${item(env)}/worksheets('${encodeURIComponent(sheet)}')` +
    `/usedRange(valuesOnly=true)?$select=address,values`,
  )) as { address: string; values: unknown[][] };
  return { address: r.address, values: r.values ?? [] };
}

/**
 * Đọc một vùng CỐ ĐỊNH.
 *
 * Dùng cho sheet `Note`: `usedRange` của nó bắt đầu ở E4 nên chỉ số cột không ổn
 * định, còn `A1:Z50` thì cột A luôn là chỉ số 0. `Note` là sheet cấu hình, không
 * dài ra theo thời gian như sheet tháng, nên vùng cố định là đủ.
 */
export async function readRange(
  env: Env, sheet: string, address: string,
): Promise<SheetData> {
  const r = (await graphFetch(
    env,
    `${item(env)}/worksheets('${encodeURIComponent(sheet)}')` +
    `/range(address='${address}')?$select=address,values`,
  )) as { address: string; values: unknown[][] };
  return { address: r.address, values: r.values ?? [] };
}
