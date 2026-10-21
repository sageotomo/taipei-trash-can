// 使用者身分：市民或政府單位。目前沒有登入，只是畫面右上角的切換，用來展示兩種視角。
// 存在這台瀏覽器（localStorage），重新整理後維持；讀寫失敗就用預設值。

export type Role = "citizen" | "gov";

export const ROLES: { id: Role; label: string }[] = [
  { id: "citizen", label: "市民" },
  { id: "gov", label: "政府單位" },
];

export const DEFAULT_ROLE: Role = "citizen";

const ROLE_KEY = "trash-bins:role:v1";

export function loadRole(): Role {
  try {
    const v = localStorage.getItem(ROLE_KEY);
    return v === "citizen" || v === "gov" ? v : DEFAULT_ROLE;
  } catch {
    return DEFAULT_ROLE;
  }
}

export function saveRole(role: Role): void {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    // 存不了就只在這次瀏覽有效
  }
}
