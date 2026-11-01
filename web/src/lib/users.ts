import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { checkPassword } from "./auth";
import { isService, type Me, type Role, type Service } from "./roles";
import { appendRows, ensureTabs, findTab, readIds, readTables, updateRows, type Cell } from "./sheets";

// Employee accounts, in their own tab «المستخدمين». Passwords are stored hashed
// (scrypt), never in clear. The owner can always log in with the name "owner"
// and APP_PASSWORD (the account that existed before employee accounts).

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const USERS_TAB = "المستخدمين";
const HEADER = ["رقم", "الاسم", "اسم الدخول", "الدور", "الخدمات", "يشوف ثمن الشراء والربح", "مفعل", "كلمة السر (مشفرة)", "تاريخ الإضافة", "آخر تعديل"];
export const OWNER_LOGIN = "owner";
export const MIN_PASSWORD = 8;

export interface UserRecord extends Me {
  login: string;
  active: boolean;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

/** What the owner sees in the list (never the hash). */
export type PublicUser = Omit<UserRecord, "passwordHash">;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** A short fingerprint of the password: changing the password signs out old sessions. */
export const passwordVersion = (u: Pick<UserRecord, "passwordHash">) => u.passwordHash.slice(-12);

const ROLES: Role[] = ["owner", "seller", "stock"];

function rowToUser(r: unknown[]): UserRecord | null {
  const s = (i: number) => String(r[i] ?? "").trim();
  if (!s(0) || !s(2)) return null;
  const role = ROLES.includes(s(3) as Role) ? (s(3) as Role) : "seller";
  return {
    id: s(0),
    name: s(1) || s(2),
    login: s(2),
    role,
    services: s(4).split(",").map((x) => x.trim()).filter(isService) as Service[],
    seeCost: s(5) === "نعم",
    active: s(6) !== "لا",
    passwordHash: s(7),
    createdAt: s(8),
    updatedAt: s(9),
  };
}

function userToRow(u: UserRecord): Cell[] {
  return [u.id, u.name, u.login, u.role, u.services.join(","), u.seeCost ? "نعم" : "لا", u.active ? "نعم" : "لا", u.passwordHash, u.createdAt, u.updatedAt];
}

let cache: { at: number; users: UserRecord[] } | null = null;

/** Accounts from the sheet, kept 30 s (a disabled employee is signed out within that time). */
export async function listUsers(refresh = false): Promise<UserRecord[]> {
  if (!refresh && cache && Date.now() - cache.at < 30_000) return cache.users;
  if (!(await findTab(USERS_TAB))) {
    cache = { at: Date.now(), users: [] };
    return [];
  }
  const rows = (await readTables([USERS_TAB]))[USERS_TAB];
  cache = { at: Date.now(), users: rows.map(rowToUser).filter((u): u is UserRecord => u !== null) };
  return cache.users;
}

/** The owner account that uses APP_PASSWORD. */
export const BUILT_IN_OWNER: Me = { id: "owner", name: "المالك", role: "owner", services: [], seeCost: true };

/** Login: the built-in owner, or an active account with the right password. */
export async function authenticate(login: string, password: string): Promise<{ me: Me; pv: string } | null> {
  const name = login.trim().toLowerCase();
  if (name === OWNER_LOGIN) return checkPassword(password) ? { me: BUILT_IN_OWNER, pv: "" } : null;
  const user = (await listUsers(true)).find((u) => u.login.toLowerCase() === name);
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) return null;
  return { me: toMe(user), pv: passwordVersion(user) };
}

export const toMe = (u: UserRecord): Me => ({ id: u.id, name: u.name, role: u.role, services: u.services, seeCost: u.seeCost });

/** The account behind a session, if still active and with the same password. */
export async function userForSession(uid: string, pv: string): Promise<Me | null> {
  if (uid === BUILT_IN_OWNER.id) return BUILT_IN_OWNER;
  const user = (await listUsers()).find((u) => u.id === uid);
  if (!user || !user.active || passwordVersion(user) !== pv) return null;
  return toMe(user);
}

export interface UserInput {
  id?: string;
  name: string;
  login: string;
  role: Role;
  services: Service[];
  seeCost: boolean;
  active: boolean;
  /** New password; empty = keep the current one. */
  password?: string;
}

/** Add or change an account (owner only; checked by the route). */
export async function saveUser(input: UserInput): Promise<PublicUser> {
  const name = input.name.trim();
  const login = input.login.trim();
  if (!name || name.length > 60) throw new UserError("السمية ضرورية");
  if (!/^[^\s]{3,30}$/.test(login)) throw new UserError("اسم الدخول: من 3 حتى 30 حرف، بلا فراغات");
  if (login.toLowerCase() === OWNER_LOGIN) throw new UserError("«owner» محجوز للمالك");
  if (!ROLES.includes(input.role)) throw new UserError("الدور غير صحيح");
  if (input.password && input.password.length < MIN_PASSWORD) throw new UserError(`كلمة السر خاصها ${MIN_PASSWORD} حروف على الأقل`);

  await ensureTabs([{ title: USERS_TAB, header: HEADER }]);
  const users = await listUsers(true);
  if (users.some((u) => u.login.toLowerCase() === login.toLowerCase() && u.id !== input.id)) throw new UserError("اسم الدخول مستعمل");
  const now = new Date().toISOString();
  const old = input.id ? users.find((u) => u.id === input.id) : undefined;
  if (input.id && !old) throw new UserError("هاد الحساب ما بقاش");
  if (!old && !input.password) throw new UserError("كلمة السر ضرورية");
  const user: UserRecord = {
    id: old?.id ?? `U-${randomBytes(6).toString("hex").toUpperCase()}`,
    name,
    login,
    role: input.role,
    services: input.role === "seller" ? input.services.filter(isService) : [],
    seeCost: input.role === "owner" ? true : Boolean(input.seeCost),
    active: Boolean(input.active),
    passwordHash: input.password ? await hashPassword(input.password) : old!.passwordHash,
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
  };
  if (old) {
    const row = (await readIds([USERS_TAB]))[USERS_TAB].indexOf(old.id) + 2;
    if (row < 2) throw new UserError("هاد الحساب ما بقاش");
    await updateRows([{ title: USERS_TAB, row, values: userToRow(user) }]);
  } else await appendRows(USERS_TAB, [userToRow(user)]);
  cache = null;
  return publicUser(user);
}

export function publicUser(u: UserRecord): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = u;
  return rest;
}

export class UserError extends Error {}
