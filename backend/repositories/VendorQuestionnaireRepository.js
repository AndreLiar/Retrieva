import { BaseRepository } from './BaseRepository.js';
import { VendorQuestionnaire } from '../models/VendorQuestionnaire.js';

class VendorQuestionnaireRepository extends BaseRepository {
  constructor(model = VendorQuestionnaire) {
    super(model);
  }

  async findByToken(token, options = {}) {
    return this.findOne({ token }, options);
  }
}

export const vendorQuestionnaireRepository = new VendorQuestionnaireRepository();
export { VendorQuestionnaireRepository };
