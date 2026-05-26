import { BaseRepository } from './BaseRepository.js';
import { User } from '../models/User.js';

class UserRepository extends BaseRepository {
  constructor(model = User) {
    super(model);
  }

  async findByEmail(email, options = {}) {
    return this.findOne({ email: email.toLowerCase() }, options);
  }

  async updateLastLogin(userId) {
    return this.model.updateOne({ _id: userId }, { $set: { lastLogin: new Date() } });
  }
}

export const userRepository = new UserRepository();
export { UserRepository };
