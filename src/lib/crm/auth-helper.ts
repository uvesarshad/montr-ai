import { userRepository } from '@/lib/db/repository/user.repository';
import { organizationRepository } from '@/lib/db/repository/organization.repository';

export async function getOrHealOrganization(userId: string, userName: string = 'My') {
    const user = await userRepository.findById(userId);
    let organizationId = user!.id?.toString();

    // Self-healing: Create organization if missing
    if (!organizationId) {
        // Check if they are already an admin (but user record not updated)
        let org = await organizationRepository.findByAdminId(userId);

        if (!org) {
            org = await organizationRepository.create({
                name: `${userName}'s Organization`,
                adminId: userId,
                memberLimit: 5,
            });
        }

        if (org) {
            organizationId = org._id.toString();
            await userRepository.updateOrganization(userId);
        }
    }

    return organizationId;
}
