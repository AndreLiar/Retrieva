/**
 * User Preference Learning Service
 *
 * CONVERSATIONAL CONTEXT: Learns and applies user preferences
 * - Communication style (brief vs detailed)
 * - Topic preferences
 * - Interaction patterns
 * - Response format preferences
 *
 * @module services/context/userPreferences
 */

import mongoose from 'mongoose';
import logger from '../../config/logger.js';

/**
 * Communication styles
 */
export const CommunicationStyle = {
  BRIEF: 'brief', // Short, to-the-point answers
  DETAILED: 'detailed', // Comprehensive explanations
  TECHNICAL: 'technical', // Technical jargon OK
  SIMPLE: 'simple', // Avoid jargon
  STRUCTURED: 'structured', // Lists and headers
  CONVERSATIONAL: 'conversational', // Flowing prose
};

/**
 * Response format preferences
 */
export const ResponseFormat = {
  PROSE: 'prose', // Paragraph form
  BULLETS: 'bullets', // Bullet points
  NUMBERED: 'numbered', // Numbered lists
  MIXED: 'mixed', // Combination
  CODE_HEAVY: 'code_heavy', // Include code examples
};

// User preferences schema
const userPreferencesSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Communication preferences
    communication: {
      style: {
        type: String,
        enum: Object.values(CommunicationStyle),
        default: CommunicationStyle.DETAILED,
      },
      styleConfidence: { type: Number, default: 0.5 },
      format: {
        type: String,
        enum: Object.values(ResponseFormat),
        default: ResponseFormat.MIXED,
      },
      formatConfidence: { type: Number, default: 0.5 },
      preferredLength: {
        type: String,
        enum: ['short', 'medium', 'long'],
        default: 'medium',
      },
      lengthConfidence: { type: Number, default: 0.5 },
    },

    // Topic preferences
    topics: {
      preferred: [
        {
          name: String,
          interactionCount: { type: Number, default: 1 },
          lastInteracted: Date,
          satisfaction: { type: Number, default: 0.5 }, // 0-1
        },
      ],
      avoided: [
        {
          name: String,
          reason: String,
          addedAt: Date,
        },
      ],
    },

    // Interaction patterns
    patterns: {
      avgQueryLength: { type: Number, default: 50 },
      avgResponseRating: { type: Number, default: 0.5 },
      followUpFrequency: { type: Number, default: 0.3 }, // How often they ask follow-ups
      clarificationFrequency: { type: Number, default: 0.2 },
      prefersDirect: { type: Boolean, default: false }, // Gets to the point quickly
      prefersContext: { type: Boolean, default: true }, // Likes background info
    },

    // Learning signals
    signals: {
      positiveSignals: [
        {
          type: { type: String }, // 'thumbs_up', 'follow_up', 'thank_you', etc.
          context: String,
          timestamp: Date,
        },
      ],
      negativeSignals: [
        {
          type: { type: String }, // 'thumbs_down', 'rephrase_request', 'confusion', etc.
          context: String,
          timestamp: Date,
        },
      ],
    },

    // Explicit preferences (user-set)
    explicit: {
      language: { type: String, default: 'en' },
      timezone: String,
      expertiseLevel: {
        type: String,
        enum: ['beginner', 'intermediate', 'expert'],
        default: 'intermediate',
      },
      customInstructions: String,
    },

    // Metadata
    totalInteractions: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
    learningEnabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

// Indexes
userPreferencesSchema.index({ lastUpdated: -1 });

const UserPreferences =
  mongoose.models.UserPreferences || mongoose.model('UserPreferences', userPreferencesSchema);

/**
 * Preference signals and their weights
 */
const SIGNAL_WEIGHTS = {
  // Positive signals
  thumbs_up: 0.15,
  thank_you: 0.1,
  follow_up_on_topic: 0.08,
  bookmark: 0.12,
  share: 0.1,

  // Negative signals
  thumbs_down: -0.15,
  rephrase_request: -0.1,
  too_long: -0.08,
  too_short: -0.08,
  confusion: -0.12,
  abandoned: -0.05,
};

/**
 * User Preference Manager
 */
class UserPreferenceManager {
  constructor() {
    this.cache = new Map();
    this.cacheMaxAge = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get or create user preferences
   *
   * @param {string} userId - User ID
   * @returns {Promise<UserPreferences>}
   */
  async getOrCreate(userId) {
    // Check cache
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.prefs;
    }

    let prefs = await UserPreferences.findOne({ userId });

    if (!prefs) {
      prefs = await UserPreferences.create({
        userId,
        lastUpdated: new Date(),
      });

      logger.info('Created new user preferences', {
        service: 'user-preferences',
        userId,
      });
    }

    // Update cache
    this.cache.set(userId, { prefs, timestamp: Date.now() });

    return prefs;
  }

  /**
   * Record a learning signal
   *
   * @param {string} userId - User ID
   * @param {string} signalType - Type of signal
   * @param {Object} context - Signal context
   */
  async recordSignal(userId, signalType, context = {}) {
    const prefs = await this.getOrCreate(userId);

    if (!prefs.learningEnabled) return;

    const signal = {
      type: signalType,
      context: JSON.stringify(context).substring(0, 200),
      timestamp: new Date(),
    };

    const weight = SIGNAL_WEIGHTS[signalType] || 0;

    if (weight > 0) {
      prefs.signals.positiveSignals.push(signal);
      // Keep only last 100
      if (prefs.signals.positiveSignals.length > 100) {
        prefs.signals.positiveSignals = prefs.signals.positiveSignals.slice(-100);
      }
    } else if (weight < 0) {
      prefs.signals.negativeSignals.push(signal);
      if (prefs.signals.negativeSignals.length > 100) {
        prefs.signals.negativeSignals = prefs.signals.negativeSignals.slice(-100);
      }
    }

    // Update preferences based on signal
    await this._applySignal(prefs, signalType, context);

    prefs.lastUpdated = new Date();
    await prefs.save();

    // Update cache
    this.cache.set(userId, { prefs, timestamp: Date.now() });

    logger.debug('Recorded learning signal', {
      service: 'user-preferences',
      userId,
      signalType,
      weight,
    });
  }

  /**
   * Apply signal to update preferences
   * @private
   */
  async _applySignal(prefs, signalType, context) {
    const learningRate = 0.1;

    switch (signalType) {
      case 'too_long':
        // Prefer shorter responses
        this._adjustPreference(prefs.communication, 'lengthConfidence', learningRate);
        if (prefs.communication.preferredLength === 'long') {
          prefs.communication.preferredLength = 'medium';
        } else if (prefs.communication.preferredLength === 'medium') {
          prefs.communication.preferredLength = 'short';
        }
        // Move toward brief style
        if (prefs.communication.styleConfidence < 0.7) {
          prefs.communication.style = CommunicationStyle.BRIEF;
          prefs.communication.styleConfidence += learningRate;
        }
        break;

      case 'too_short':
        // Prefer longer responses
        this._adjustPreference(prefs.communication, 'lengthConfidence', learningRate);
        if (prefs.communication.preferredLength === 'short') {
          prefs.communication.preferredLength = 'medium';
        } else if (prefs.communication.preferredLength === 'medium') {
          prefs.communication.preferredLength = 'long';
        }
        // Move toward detailed style
        if (prefs.communication.styleConfidence < 0.7) {
          prefs.communication.style = CommunicationStyle.DETAILED;
          prefs.communication.styleConfidence += learningRate;
        }
        break;

      case 'thumbs_up':
        // Reinforce current style
        prefs.communication.styleConfidence = Math.min(
          1,
          prefs.communication.styleConfidence + learningRate
        );
        prefs.communication.formatConfidence = Math.min(
          1,
          prefs.communication.formatConfidence + learningRate
        );
        prefs.patterns.avgResponseRating = Math.min(1, prefs.patterns.avgResponseRating + 0.05);
        break;

      case 'thumbs_down':
        // Reduce confidence in current style
        prefs.communication.styleConfidence = Math.max(
          0.1,
          prefs.communication.styleConfidence - learningRate
        );
        prefs.patterns.avgResponseRating = Math.max(0, prefs.patterns.avgResponseRating - 0.05);
        break;

      case 'follow_up_on_topic':
        // User is interested in this topic
        if (context.topic) {
          this._updateTopicPreference(prefs, context.topic, 0.1);
        }
        prefs.patterns.followUpFrequency = Math.min(1, prefs.patterns.followUpFrequency + 0.02);
        break;

      case 'rephrase_request':
        // User didn't understand
        prefs.patterns.clarificationFrequency = Math.min(
          1,
          prefs.patterns.clarificationFrequency + 0.03
        );
        // Maybe too technical
        if (prefs.communication.style === CommunicationStyle.TECHNICAL) {
          prefs.communication.style = CommunicationStyle.SIMPLE;
          prefs.communication.styleConfidence = 0.5;
        }
        break;

      case 'confusion':
        // User is confused - simplify
        if (prefs.communication.styleConfidence < 0.8) {
          prefs.communication.style = CommunicationStyle.SIMPLE;
        }
        prefs.patterns.prefersContext = true;
        break;
    }
  }

  /**
   * Adjust preference confidence
   * @private
   */
  _adjustPreference(obj, field, amount) {
    obj[field] = Math.min(1, Math.max(0, (obj[field] || 0.5) + amount));
  }

  /**
   * Update topic preference
   * @private
   */
  _updateTopicPreference(prefs, topic, delta) {
    const existing = prefs.topics.preferred.find(
      (t) => t.name.toLowerCase() === topic.toLowerCase()
    );

    if (existing) {
      existing.interactionCount += 1;
      existing.lastInteracted = new Date();
      existing.satisfaction = Math.min(1, Math.max(0, existing.satisfaction + delta));
    } else {
      prefs.topics.preferred.push({
        name: topic,
        interactionCount: 1,
        lastInteracted: new Date(),
        satisfaction: 0.5 + delta,
      });
    }

    // Keep only top 50 topics
    if (prefs.topics.preferred.length > 50) {
      prefs.topics.preferred.sort((a, b) => b.interactionCount - a.interactionCount);
      prefs.topics.preferred = prefs.topics.preferred.slice(0, 50);
    }
  }

  /**
   * Learn from interaction
   *
   * @param {string} userId - User ID
   * @param {Object} interaction - Interaction details
   */
  async learnFromInteraction(userId, interaction) {
    const { queryLength, responseLength, intent, topic, hadFollowUp, hadClarification } =
      interaction;

    const prefs = await this.getOrCreate(userId);

    if (!prefs.learningEnabled) return;

    // Update interaction count
    prefs.totalInteractions += 1;

    // Learn query length preference
    const prevAvg = prefs.patterns.avgQueryLength;
    prefs.patterns.avgQueryLength = prevAvg + (queryLength - prevAvg) / prefs.totalInteractions;

    // Update follow-up frequency
    if (hadFollowUp) {
      prefs.patterns.followUpFrequency = Math.min(1, prefs.patterns.followUpFrequency + 0.01);
    } else {
      prefs.patterns.followUpFrequency = Math.max(0, prefs.patterns.followUpFrequency - 0.005);
    }

    // Update clarification frequency
    if (hadClarification) {
      prefs.patterns.clarificationFrequency = Math.min(
        1,
        prefs.patterns.clarificationFrequency + 0.02
      );
    }

    // Infer style from query
    if (queryLength < 30) {
      prefs.patterns.prefersDirect = true;
    } else if (queryLength > 100) {
      prefs.patterns.prefersContext = true;
    }

    // Update topic preference
    if (topic) {
      this._updateTopicPreference(prefs, topic, 0.05);
    }

    prefs.lastUpdated = new Date();
    await prefs.save();

    // Update cache
    this.cache.set(userId, { prefs, timestamp: Date.now() });
  }

  /**
   * Get personalized prompt additions
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async getPromptPersonalization(userId) {
    const prefs = await this.getOrCreate(userId);

    const additions = [];

    // Communication style
    if (prefs.communication.styleConfidence > 0.6) {
      switch (prefs.communication.style) {
        case CommunicationStyle.BRIEF:
          additions.push('Keep responses concise and to-the-point.');
          break;
        case CommunicationStyle.DETAILED:
          additions.push('Provide comprehensive, detailed explanations.');
          break;
        case CommunicationStyle.TECHNICAL:
          additions.push('Use technical terminology when appropriate.');
          break;
        case CommunicationStyle.SIMPLE:
          additions.push('Use simple language and avoid jargon.');
          break;
        case CommunicationStyle.STRUCTURED:
          additions.push('Use structured formatting with headers and lists.');
          break;
      }
    }

    // Length preference
    if (prefs.communication.lengthConfidence > 0.6) {
      switch (prefs.communication.preferredLength) {
        case 'short':
          additions.push('Keep responses brief (2-3 paragraphs max).');
          break;
        case 'long':
          additions.push('Provide thorough, detailed responses.');
          break;
      }
    }

    // Format preference
    if (prefs.communication.formatConfidence > 0.6) {
      switch (prefs.communication.format) {
        case ResponseFormat.BULLETS:
          additions.push('Use bullet points for clarity.');
          break;
        case ResponseFormat.NUMBERED:
          additions.push('Use numbered lists for steps or sequences.');
          break;
        case ResponseFormat.CODE_HEAVY:
          additions.push('Include code examples where relevant.');
          break;
      }
    }

    // Expertise level
    if (prefs.explicit.expertiseLevel) {
      additions.push(`Assume ${prefs.explicit.expertiseLevel}-level understanding.`);
    }

    // Custom instructions
    if (prefs.explicit.customInstructions) {
      additions.push(prefs.explicit.customInstructions);
    }

    return {
      promptAdditions: additions,
      style: prefs.communication.style,
      format: prefs.communication.format,
      length: prefs.communication.preferredLength,
      expertise: prefs.explicit.expertiseLevel,
      preferredTopics: prefs.topics.preferred.slice(0, 5).map((t) => t.name),
    };
  }

  /**
   * Set explicit preference
   *
   * @param {string} userId - User ID
   * @param {string} key - Preference key
   * @param {any} value - Preference value
   */
  async setExplicitPreference(userId, key, value) {
    const prefs = await this.getOrCreate(userId);

    const validKeys = ['language', 'timezone', 'expertiseLevel', 'customInstructions'];
    if (validKeys.includes(key)) {
      prefs.explicit[key] = value;
      prefs.lastUpdated = new Date();
      await prefs.save();

      // Update cache
      this.cache.set(userId, { prefs, timestamp: Date.now() });

      logger.info('Set explicit user preference', {
        service: 'user-preferences',
        userId,
        key,
      });
    }
  }

  /**
   * Get user preferences summary
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async getSummary(userId) {
    const prefs = await this.getOrCreate(userId);

    return {
      userId,
      communication: {
        style: prefs.communication.style,
        format: prefs.communication.format,
        length: prefs.communication.preferredLength,
        styleConfidence: prefs.communication.styleConfidence.toFixed(2),
      },
      patterns: {
        avgQueryLength: Math.round(prefs.patterns.avgQueryLength),
        followUpFrequency: (prefs.patterns.followUpFrequency * 100).toFixed(0) + '%',
        prefersDirect: prefs.patterns.prefersDirect,
        prefersContext: prefs.patterns.prefersContext,
      },
      topTopics: prefs.topics.preferred
        .sort((a, b) => b.interactionCount - a.interactionCount)
        .slice(0, 5)
        .map((t) => t.name),
      totalInteractions: prefs.totalInteractions,
      learningEnabled: prefs.learningEnabled,
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Singleton
export const userPreferenceManager = new UserPreferenceManager();
export { UserPreferenceManager, UserPreferences };
