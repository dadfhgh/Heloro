import { describe, expect, it } from "vitest";
import {
  canDeleteCommunityMessage,
  canManageCommunityAdmin,
  EMPTY_COMMUNITY_ADMIN_PERMISSIONS,
  hasCommunityPermission,
} from "./communityPermissions";

describe("community admin permissions", () => {
  it("gives the owner full permission without relying on stored flags", () => {
    expect(hasCommunityPermission("owner", {}, "delete_messages")).toBe(true);
    expect(hasCommunityPermission("owner", {}, "manage_admins")).toBe(true);
  });

  it("allows an admin to use only explicitly granted permissions", () => {
    const permissions = { ...EMPTY_COMMUNITY_ADMIN_PERMISSIONS, delete_messages: true };
    expect(hasCommunityPermission("admin", permissions, "delete_messages")).toBe(true);
    expect(hasCommunityPermission("admin", permissions, "change_info")).toBe(false);
  });

  it("does not grant administrative permissions to ordinary members", () => {
    const permissions = { delete_messages: true, manage_admins: true };
    expect(hasCommunityPermission("member", permissions, "delete_messages")).toBe(false);
    expect(hasCommunityPermission(null, permissions, "manage_admins")).toBe(false);
  });

  it("lets delegated admin managers edit only administrators whose rights are a subset", () => {
    const manager = { change_info: true, delete_messages: true, manage_admins: true };
    expect(canManageCommunityAdmin("admin", manager, "admin", { delete_messages: true })).toBe(true);
    expect(canManageCommunityAdmin("admin", manager, "admin", { post_messages: true })).toBe(false);
    expect(canManageCommunityAdmin("admin", manager, "admin", { manage_admins: true })).toBe(false);
    expect(canManageCommunityAdmin("admin", { delete_messages: true }, "admin", {})).toBe(false);
    expect(canManageCommunityAdmin("owner", {}, "admin", { manage_admins: true })).toBe(true);
  });

  it("lets authors delete their own community messages without admin rights", () => {
    expect(canDeleteCommunityMessage("member", {}, "user-a", "user-a")).toBe(true);
    expect(canDeleteCommunityMessage("member", {}, "user-b", "user-a")).toBe(false);
  });

  it("requires the delete permission to remove another member's message", () => {
    expect(canDeleteCommunityMessage("admin", { delete_messages: true }, "user-b", "user-a")).toBe(true);
    expect(canDeleteCommunityMessage("admin", { delete_messages: false }, "user-b", "user-a")).toBe(false);
    expect(canDeleteCommunityMessage("owner", {}, "user-b", "user-a")).toBe(true);
  });
});
