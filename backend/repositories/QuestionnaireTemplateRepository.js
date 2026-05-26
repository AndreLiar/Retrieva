import { BaseRepository } from './BaseRepository.js';
import QuestionnaireTemplate from '../models/QuestionnaireTemplate.js';

class QuestionnaireTemplateRepository extends BaseRepository {
  constructor(model = QuestionnaireTemplate) {
    super(model);
  }

  async findDefault() {
    return this.findOne({ isDefault: true });
  }
}

export const questionnaireTemplateRepository = new QuestionnaireTemplateRepository();
export { QuestionnaireTemplateRepository };
