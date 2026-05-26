import { BaseRepository } from './BaseRepository.js';
import { Organization } from '../models/Organization.js';

class OrganizationRepository extends BaseRepository {
  constructor(model = Organization) {
    super(model);
  }
}

export const organizationRepository = new OrganizationRepository();
export { OrganizationRepository };
