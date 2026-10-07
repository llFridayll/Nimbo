import { UserRole } from "@prisma/client";
import { ProfileAvatarForm } from "@/components/ProfileAvatarForm";
import { ProfileNameForm } from "@/components/ProfileNameForm";
import { avatarSrc } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/dal";
import { roleLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">โปรไฟล์ของฉัน</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {user.displayName} · {roleLabel(user.role === UserRole.ADMIN)} · ชื่อผู้ใช้ {user.username}
        </p>
      </div>

      <ProfileAvatarForm displayName={user.displayName} currentSrc={avatarSrc(user.id, user.avatarUpdatedAt)} />
      <ProfileNameForm displayName={user.displayName} username={user.username} />
    </div>
  );
}
