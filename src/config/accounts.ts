import type { Person, Role } from '../domain/types';

/**
 * Who can sign in (demo sign-in, src/lib/session.ts): the username is the person's e-mail. Added at the owner's request
 * on 28 Sep 2026; work e-mails and three more people on 1 Oct 2026. Company sign-in (Entra ID, P3-02) replaces this
 * list. `login` is the tool login (the e-mail name in capitals, as in "Created By");
 * name, e-mail and division must match the person in the tool's employee list (data/scenarios/demo.json, checked by a
 * test). Only scrypt hashes are kept: `npm run hash-password -- "<new password>"`, paste the hash here, deploy.
 * This list seeds the account store (src/store) when the server starts; Admin can add people, change roles and reset
 * passwords from /admin/users (in memory until P3-06). The owner is the Admin (asked for on 30 Sep 2026).
 */
export type Account = Person & { email: string; login: string; passwordHash: string; role: Role };

/**
 * A test Admin for trying the Admin pages (asked for on 1 Oct 2026): sign in as `admin.test@email.com`. Its password is
 * short and known, so production servers leave it out unless their environment sets ENABLE_TEST_ADMIN=true (read when the
 * server starts). Development and tests always have it.
 */
const TEST_ADMIN: Account = {
  login: 'ADMIN.TEST',
  name: 'Tester, Admin',
  email: 'admin.test@email.com',
  role: 'admin',
  passwordHash: 'scrypt$ElzyKM5oTui5Ixv2Qg9bjQ$HnlWPcMBrCCxHrSqfVdAYPQNLpLC1v8ouRsTLOJVrQU',
};

export const ACCOUNTS: readonly Account[] = [
  {
    login: 'MARKJOSEPH.REMETIO',
    name: 'Remetio, Mark Joseph',
    email: 'markjoseph.remetio@lexisnexis.com',
    division: 'Sales',
    role: 'admin',
    passwordHash: 'scrypt$Ain53ts7QIS92VcSt1MUhw$0sEmE4JgX9qg6wS9fgfAu1yvmyafGoonAjmU1UfSAqU',
  },
  {
    login: 'JEREMIAH.SANDOVAL',
    name: 'Sandoval, Jeremiah',
    email: 'jeremiah.sandoval@lexisnexis.com',
    role: 'user',
    passwordHash: 'scrypt$Fvd7mvfr-nxGos2UqNxmXg$d9tTqRMsMgVRYBnhax33vWMSDCqYipb-BQWSkD_Cy84',
  },
  {
    login: 'LILI.LAGUNOY',
    name: 'Lagunoy, Lili',
    email: 'lili.lagunoy@lexisnexis.com',
    role: 'user',
    passwordHash: 'scrypt$yMrEIg36xgsDqaBS-qOMlg$_tV7yI3poNC1pVJjSsP9lZqRZFnhK2wGRgj6DYPVpAM',
  },
  {
    login: 'TAEHWAN.KIM',
    name: 'Kim, Tae Hwan S.',
    email: 'taehwan.kim@reedelsevier.com',
    role: 'user',
    passwordHash: 'scrypt$_1dNWJl1ihSYfWvK15euiA$QMtABomR4Y1dAxz-6eiksWB0HnXqGmbQTlygTLm0tGs',
  },
  {
    login: 'ALBERT.VILLAGRACIA',
    name: 'Villagracia, Albert',
    email: 'albert.villagracia@reedelsevier.com',
    role: 'user',
    passwordHash: 'scrypt$fCNXccBwHJx2qOtehtMVpA$AW0931x_uf4xcMp8eB1MVd09D59OejVmdGcqy_dCTzg',
  },
  {
    login: 'DUMMY.ACCOUNT',
    name: 'Account, Dummy',
    email: 'dummy.account@example.com',
    division: 'External Judge',
    role: 'user',
    passwordHash: 'scrypt$3Bc5UKuoQpgm6-kjUip08w$LxmhHNdGMYOaehth-srsBkJEGe9GaZ3LNLScQdPzD1M',
  },
  ...(process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_ADMIN === 'true' ? [TEST_ADMIN] : []),
];
