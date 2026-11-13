export type CommunityAdminPermission =
  | "change_info"
  | "delete_messages"
  | "post_messages"
  | "manage_admins";

export type CommunityAdminPermissions = Record<CommunityAdminPermission, boolean>;

export const EMPTY_COMMUNITY_ADMIN_PERMISSIONS: CommunityAdminPermissions = {
  change_info: false,
  delete_messages: false,
  post_messages: false,
  manage_admins: false,
};

export function hasCommunityPermission(
  role: string | null,
  permissions: Partial<CommunityAdminPermissions> | null | undefined,
  permission: CommunityAdminPermission,
): boolean {
  if (role === "owner") return true;
  return role === "admin" && permissions?.[permission] === true;
}

export function canDeleteCommunityMessage(
  role: string | null,
  permissions: Partial<CommunityAdminPermissions> | null | undefined,
  senderId: string,
  currentUserId: string,
): boolean {
  return senderId === currentUserId || hasCommunityPermission(role, permissions, "delete_messages");
}
