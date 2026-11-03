// Who can do what on the admin page. Each role is a set of permissions; the
// server checks the permission on every admin request, and the page only
// shows what the signed-in admin may use.

export const PERMISSIONS = {
    "overview": "See the overview numbers",
    "feedback.read": "Read feedback",
    "feedback.manage": "Mark feedback as read",
    "users.read": "Look people up",
    "users.plans": "Change someone's plan",
    "explore.moderate": "Take scenes off Explore",
    "admins.manage": "Add and remove admins, and read the activity log",
} as const;
export type Permission = keyof typeof PERMISSIONS;

export const ROLES = {
    superuser: { label: "Superuser", about: "Everything, including other admins" },
    admin: { label: "Admin", about: "Everything except managing admins" },
    moderator: { label: "Moderator", about: "Feedback and Explore" },
    support: { label: "Support", about: "Reads feedback and looks people up" },
} as const;
export type Role = keyof typeof ROLES;
export const ROLE_IDS = Object.keys(ROLES) as Role[];

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
    superuser: ALL,
    admin: ALL.filter((p) => p !== "admins.manage"),
    moderator: ["overview", "feedback.read", "feedback.manage", "explore.moderate"],
    support: ["overview", "feedback.read", "users.read"],
};

export const can = (role: Role, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);
