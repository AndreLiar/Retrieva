/**
 * Base Repository Class
 *
 * Provides common CRUD operations and query patterns.
 * Implements the Repository Pattern to:
 * - Decouple business logic from data access
 * - Enable database switching without changing services
 * - Centralize query logic for testability
 * - Provide consistent error handling
 *
 * Usage:
 *   class UserRepository extends BaseRepository {
 *     constructor() {
 *       super(UserModel);
 *     }
 *
 *     async findByEmail(email) {
 *       return this.findOne({ email });
 *     }
 *   }
 */
class BaseRepository {
  /**
   * @param {mongoose.Model} model - Mongoose model to operate on
   */
  constructor(model) {
    this.model = model;
  }

  /**
   * Create a new document
   * @param {Object} data - Document data
   * @returns {Promise<Document>}
   */
  async create(data) {
    return this.model.create(data);
  }

  /**
   * Create multiple documents
   * @param {Array<Object>} data - Array of document data
   * @returns {Promise<Array<Document>>}
   */
  async createMany(data) {
    return this.model.insertMany(data);
  }

  /**
   * Find document by ID
   * @param {string} id - Document ID
   * @param {Object} options - Query options
   * @returns {Promise<Document|null>}
   */
  async findById(id, options = {}) {
    const query = this.model.findById(id);
    if (options.select) query.select(options.select);
    if (options.populate) query.populate(options.populate);
    return query.exec();
  }

  /**
   * Find one document matching criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options
   * @returns {Promise<Document|null>}
   */
  async findOne(criteria, options = {}) {
    const query = this.model.findOne(criteria);
    if (options.select) query.select(options.select);
    if (options.populate) query.populate(options.populate);
    return query.exec();
  }

  /**
   * Find all documents matching criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options (select, populate, sort, limit, skip)
   * @returns {Promise<Array<Document>>}
   */
  async find(criteria = {}, options = {}) {
    const query = this.model.find(criteria);
    if (options.select) query.select(options.select);
    if (options.populate) query.populate(options.populate);
    if (options.sort) query.sort(options.sort);
    if (options.limit) query.limit(options.limit);
    if (options.skip) query.skip(options.skip);
    return query.exec();
  }

  /**
   * Update document by ID
   * @param {string} id - Document ID
   * @param {Object} update - Update data
   * @param {Object} options - Update options
   * @returns {Promise<Document|null>}
   */
  async updateById(id, update, options = {}) {
    return this.model.findByIdAndUpdate(id, update, { new: true, runValidators: true, ...options });
  }

  /**
   * Update one document matching criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} update - Update data
   * @param {Object} options - Update options
   * @returns {Promise<Document|null>}
   */
  async updateOne(criteria, update, options = {}) {
    return this.model.findOneAndUpdate(criteria, update, {
      new: true,
      runValidators: true,
      ...options,
    });
  }

  /**
   * Update many documents matching criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} update - Update data
   * @returns {Promise<Object>} - Update result
   */
  async updateMany(criteria, update) {
    return this.model.updateMany(criteria, update);
  }

  /**
   * Delete document by ID
   * @param {string} id - Document ID
   * @returns {Promise<Document|null>}
   */
  async deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }

  /**
   * Delete one document matching criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Document|null>}
   */
  async deleteOne(criteria) {
    return this.model.findOneAndDelete(criteria);
  }

  /**
   * Delete many documents matching criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Object>} - Delete result
   */
  async deleteMany(criteria) {
    return this.model.deleteMany(criteria);
  }

  /**
   * Count documents matching criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<number>}
   */
  async count(criteria = {}) {
    return this.model.countDocuments(criteria);
  }

  /**
   * Check if document exists
   * @param {Object} criteria - Search criteria
   * @returns {Promise<boolean>}
   */
  async exists(criteria) {
    const result = await this.model.exists(criteria);
    return !!result;
  }

  /**
   * Run aggregation pipeline
   * @param {Array} pipeline - Aggregation pipeline stages
   * @returns {Promise<Array>}
   */
  async aggregate(pipeline) {
    return this.model.aggregate(pipeline);
  }

  /**
   * Get distinct values for a field
   * @param {string} field - Field name
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Array>}
   */
  async distinct(field, criteria = {}) {
    return this.model.distinct(field, criteria);
  }

  /**
   * Paginated find with total count
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options
   * @returns {Promise<{data: Array, total: number, page: number, limit: number}>}
   */
  async findPaginated(criteria = {}, options = {}) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.find(criteria, { ...options, skip, limit }),
      this.count(criteria),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }
}

export { BaseRepository };
