/**
 * Session State Management Service
 *
 * CONVERSATIONAL CONTEXT: Manages conversation session state
 * - Tracks conversation phase (greeting, exploring, deep-dive, closing)
 * - Maintains topic focus and shifts
 * - Manages conversation flow and transitions
 *
 * @module services/context/sessionState
 */

import mongoose from 'mongoose';
import logger from '../../config/logger.js';

/**
 * Conversation phases
 */
export const ConversationPhase = {
  GREETING: 'greeting', // Initial greeting/introduction
  EXPLORING: 'exploring', // User exploring topics
  FOCUSED: 'focused', // Deep-dive on specific topic
  COMPARING: 'comparing', // Comparing options
  PROBLEM_SOLVING: 'problem_solving', // Working through an issue
  CLARIFYING: 'clarifying', // Asking follow-ups
  CONCLUDING: 'concluding', // Wrapping up
  IDLE: 'idle', // No recent activity
};

/**
 * Topic shift types
 */
export const TopicShift = {
  NONE: 'none', // Same topic
  RELATED: 'related', // Related topic
  COMPLETE: 'complete', // Completely new topic
  RETURN: 'return', // Returning to previous topic
};

// Session state schema
const sessionStateSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },

    // Current phase
    currentPhase: {
      type: String,
      enum: Object.values(ConversationPhase),
      default: ConversationPhase.GREETING,
    },
    phaseHistory: [
      {
        phase: String,
        enteredAt: Date,
        duration: Number, // seconds
      },
    ],

    // Topic tracking
    currentTopic: {
      name: String,
      startedAt: Date,
      messageCount: { type: Number, default: 0 },
      entities: [String],
    },
    topicHistory: [
      {
        name: String,
        startedAt: Date,
        endedAt: Date,
        messageCount: Number,
        shiftType: String,
      },
    ],

    // Conversation metrics
    metrics: {
      totalMessages: { type: Number, default: 0 },
      userMessages: { type: Number, default: 0 },
      assistantMessages: { type: Number, default: 0 },
      avgResponseLength: { type: Number, default: 0 },
      topicChanges: { type: Number, default: 0 },
      clarificationRequests: { type: Number, default: 0 },
    },

    // Context window
    activeEntities: [
      {
        name: String,
        type: String,
        firstMentioned: Date,
        lastMentioned: Date,
        mentionCount: { type: Number, default: 1 },
      },
    ],

    // Last interaction
    lastInteraction: {
      timestamp: Date,
      userQuery: String,
      assistantResponse: String,
      intent: String,
      wasHelpful: Boolean, // from feedback
    },

    // Session metadata
    startedAt: {
      type: Date,
      default: Date.now,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
sessionStateSchema.index({ userId: 1, lastActivityAt: -1 });
sessionStateSchema.index({ workspaceId: 1, isActive: 1 });

const SessionState =
  mongoose.models.SessionState || mongoose.model('SessionState', sessionStateSchema);

/**
 * Session State Manager
 */
class SessionStateManager {
  constructor() {
    this.inMemoryStates = new Map(); // For fast access
    this.phaseTransitions = this._buildPhaseTransitions();
  }

  /**
   * Build valid phase transitions
   * @private
   */
  _buildPhaseTransitions() {
    return {
      [ConversationPhase.GREETING]: [ConversationPhase.EXPLORING, ConversationPhase.FOCUSED],
      [ConversationPhase.EXPLORING]: [
        ConversationPhase.FOCUSED,
        ConversationPhase.COMPARING,
        ConversationPhase.CONCLUDING,
      ],
      [ConversationPhase.FOCUSED]: [
        ConversationPhase.CLARIFYING,
        ConversationPhase.EXPLORING,
        ConversationPhase.PROBLEM_SOLVING,
        ConversationPhase.CONCLUDING,
      ],
      [ConversationPhase.COMPARING]: [
        ConversationPhase.FOCUSED,
        ConversationPhase.EXPLORING,
        ConversationPhase.CONCLUDING,
      ],
      [ConversationPhase.PROBLEM_SOLVING]: [
        ConversationPhase.CLARIFYING,
        ConversationPhase.FOCUSED,
        ConversationPhase.CONCLUDING,
      ],
      [ConversationPhase.CLARIFYING]: [
        ConversationPhase.FOCUSED,
        ConversationPhase.EXPLORING,
        ConversationPhase.CONCLUDING,
      ],
      [ConversationPhase.CONCLUDING]: [ConversationPhase.IDLE, ConversationPhase.EXPLORING],
      [ConversationPhase.IDLE]: [ConversationPhase.GREETING, ConversationPhase.EXPLORING],
    };
  }

  /**
   * Get or create session state
   *
   * @param {string} conversationId - Conversation ID
   * @param {Object} defaults - Default values
   * @returns {Promise<SessionState>}
   */
  async getOrCreate(conversationId, defaults = {}) {
    // Check in-memory cache first
    if (this.inMemoryStates.has(conversationId)) {
      return this.inMemoryStates.get(conversationId);
    }

    let state = await SessionState.findOne({ conversationId });

    if (!state) {
      state = await SessionState.create({
        conversationId,
        userId: defaults.userId || 'unknown',
        workspaceId: defaults.workspaceId || 'default',
        currentPhase: ConversationPhase.GREETING,
        startedAt: new Date(),
        lastActivityAt: new Date(),
      });

      logger.info('Created new session state', {
        service: 'session-state',
        conversationId,
      });
    }

    // Cache in memory
    this.inMemoryStates.set(conversationId, state);

    return state;
  }

  /**
   * Update session with new interaction
   *
   * @param {string} conversationId - Conversation ID
   * @param {Object} interaction - Interaction details
   * @returns {Promise<SessionState>}
   */
  async updateInteraction(conversationId, interaction) {
    const { userQuery, assistantResponse, intent, entities = [], topic = null } = interaction;

    const state = await this.getOrCreate(conversationId);
    const now = new Date();

    // Update metrics
    state.metrics.totalMessages += 2;
    state.metrics.userMessages += 1;
    state.metrics.assistantMessages += 1;
    state.metrics.avgResponseLength =
      (state.metrics.avgResponseLength * (state.metrics.assistantMessages - 1) +
        assistantResponse.length) /
      state.metrics.assistantMessages;

    // Update last interaction
    state.lastInteraction = {
      timestamp: now,
      userQuery,
      assistantResponse: assistantResponse.substring(0, 500),
      intent,
    };

    // Update entities
    for (const entity of entities) {
      const existing = state.activeEntities.find(
        (e) => e.name.toLowerCase() === entity.name?.toLowerCase()
      );
      if (existing) {
        existing.lastMentioned = now;
        existing.mentionCount += 1;
      } else {
        state.activeEntities.push({
          name: entity.name,
          type: entity.type || 'unknown',
          firstMentioned: now,
          lastMentioned: now,
          mentionCount: 1,
        });
      }
    }

    // Keep only recent entities (max 20)
    if (state.activeEntities.length > 20) {
      state.activeEntities.sort((a, b) => b.lastMentioned - a.lastMentioned);
      state.activeEntities = state.activeEntities.slice(0, 20);
    }

    // Handle topic change
    if (topic) {
      await this._handleTopicChange(state, topic, now);
    }

    // Determine phase transition
    const newPhase = this._determinePhase(state, intent, topic);
    if (newPhase !== state.currentPhase) {
      await this._transitionPhase(state, newPhase, now);
    }

    // Update current topic message count
    if (state.currentTopic.name) {
      state.currentTopic.messageCount += 1;
    }

    state.lastActivityAt = now;
    await state.save();

    // Update cache
    this.inMemoryStates.set(conversationId, state);

    return state;
  }

  /**
   * Handle topic change
   * @private
   */
  async _handleTopicChange(state, newTopic, timestamp) {
    const currentTopic = state.currentTopic.name;

    if (!currentTopic) {
      // First topic
      state.currentTopic = {
        name: newTopic,
        startedAt: timestamp,
        messageCount: 1,
        entities: [],
      };
      return;
    }

    if (currentTopic.toLowerCase() === newTopic.toLowerCase()) {
      // Same topic
      return;
    }

    // Determine shift type
    let shiftType = TopicShift.COMPLETE;

    // Check if returning to previous topic
    const previousTopic = state.topicHistory.find(
      (t) => t.name.toLowerCase() === newTopic.toLowerCase()
    );
    if (previousTopic) {
      shiftType = TopicShift.RETURN;
    }

    // Archive current topic
    state.topicHistory.push({
      name: state.currentTopic.name,
      startedAt: state.currentTopic.startedAt,
      endedAt: timestamp,
      messageCount: state.currentTopic.messageCount,
      shiftType,
    });

    // Start new topic
    state.currentTopic = {
      name: newTopic,
      startedAt: timestamp,
      messageCount: 1,
      entities: [],
    };

    state.metrics.topicChanges += 1;

    // Keep only last 20 topics
    if (state.topicHistory.length > 20) {
      state.topicHistory = state.topicHistory.slice(-20);
    }
  }

  /**
   * Determine appropriate phase based on context
   * @private
   */
  _determinePhase(state, intent, _topic) {
    const currentPhase = state.currentPhase;
    const messageCount = state.metrics.totalMessages;
    const topicMessageCount = state.currentTopic.messageCount || 0;

    // Greeting phase - first few messages
    if (messageCount <= 2 && intent === 'chitchat') {
      return ConversationPhase.GREETING;
    }

    // Clarifying phase
    if (intent === 'clarification') {
      state.metrics.clarificationRequests += 1;
      return ConversationPhase.CLARIFYING;
    }

    // Comparing phase
    if (intent === 'comparison') {
      return ConversationPhase.COMPARING;
    }

    // Problem solving
    if (intent === 'procedural' || (intent === 'explanation' && topicMessageCount > 3)) {
      return ConversationPhase.PROBLEM_SOLVING;
    }

    // Focused phase - deep dive on topic
    if (topicMessageCount >= 3 && ['factual', 'explanation'].includes(intent)) {
      return ConversationPhase.FOCUSED;
    }

    // Exploring phase - bouncing between topics
    if (state.metrics.topicChanges > 2 && topicMessageCount < 3) {
      return ConversationPhase.EXPLORING;
    }

    // Concluding indicators
    if (intent === 'chitchat' && messageCount > 5) {
      const lastQuery = state.lastInteraction?.userQuery?.toLowerCase() || '';
      if (/thank|thanks|bye|goodbye|that'?s all|done|finished/i.test(lastQuery)) {
        return ConversationPhase.CONCLUDING;
      }
    }

    // Check for idle (no activity for 30 minutes)
    const timeSinceLastActivity = Date.now() - new Date(state.lastActivityAt).getTime();
    if (timeSinceLastActivity > 30 * 60 * 1000) {
      return ConversationPhase.IDLE;
    }

    return currentPhase;
  }

  /**
   * Transition to new phase
   * @private
   */
  async _transitionPhase(state, newPhase, timestamp) {
    const oldPhase = state.currentPhase;

    // Calculate duration of old phase
    const lastPhaseEntry = state.phaseHistory[state.phaseHistory.length - 1];
    const phaseStartTime = lastPhaseEntry?.enteredAt || state.startedAt;
    const duration = Math.round((timestamp - new Date(phaseStartTime)) / 1000);

    // Update last phase duration
    if (lastPhaseEntry) {
      lastPhaseEntry.duration = duration;
    }

    // Add new phase
    state.phaseHistory.push({
      phase: newPhase,
      enteredAt: timestamp,
      duration: 0,
    });

    // Keep only last 20 phase transitions
    if (state.phaseHistory.length > 20) {
      state.phaseHistory = state.phaseHistory.slice(-20);
    }

    state.currentPhase = newPhase;

    logger.debug('Session phase transition', {
      service: 'session-state',
      conversationId: state.conversationId,
      from: oldPhase,
      to: newPhase,
      duration,
    });
  }

  /**
   * Get session context for prompts
   *
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>}
   */
  async getSessionContext(conversationId) {
    const state = await this.getOrCreate(conversationId);

    return {
      phase: state.currentPhase,
      topic: state.currentTopic.name,
      topicDepth: state.currentTopic.messageCount,
      recentEntities: state.activeEntities.slice(0, 5).map((e) => e.name),
      isExploring: state.currentPhase === ConversationPhase.EXPLORING,
      isFocused: state.currentPhase === ConversationPhase.FOCUSED,
      isProblemSolving: state.currentPhase === ConversationPhase.PROBLEM_SOLVING,
      messageCount: state.metrics.totalMessages,
      topicChanges: state.metrics.topicChanges,
    };
  }

  /**
   * Get session statistics
   *
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>}
   */
  async getStats(conversationId) {
    const state = await this.getOrCreate(conversationId);

    return {
      conversationId,
      phase: state.currentPhase,
      duration: Math.round((Date.now() - new Date(state.startedAt)) / 1000),
      metrics: state.metrics,
      currentTopic: state.currentTopic.name,
      topicHistory: state.topicHistory.map((t) => t.name),
      entityCount: state.activeEntities.length,
      phaseTransitions: state.phaseHistory.length,
    };
  }

  /**
   * End session
   *
   * @param {string} conversationId - Conversation ID
   */
  async endSession(conversationId) {
    const state = await SessionState.findOne({ conversationId });
    if (state) {
      state.isActive = false;
      state.currentPhase = ConversationPhase.IDLE;
      await state.save();
    }

    this.inMemoryStates.delete(conversationId);

    logger.info('Session ended', {
      service: 'session-state',
      conversationId,
    });
  }

  /**
   * Clear inactive sessions
   *
   * @param {number} maxIdleMinutes - Max idle time in minutes
   */
  async clearInactiveSessions(maxIdleMinutes = 60) {
    const cutoff = new Date(Date.now() - maxIdleMinutes * 60 * 1000);

    const result = await SessionState.updateMany(
      { lastActivityAt: { $lt: cutoff }, isActive: true },
      { $set: { isActive: false, currentPhase: ConversationPhase.IDLE } }
    );

    // Clear from memory cache
    for (const [id, state] of this.inMemoryStates) {
      if (new Date(state.lastActivityAt) < cutoff) {
        this.inMemoryStates.delete(id);
      }
    }

    logger.info('Cleared inactive sessions', {
      service: 'session-state',
      deactivated: result.modifiedCount,
    });

    return result.modifiedCount;
  }
}

// Singleton
export const sessionStateManager = new SessionStateManager();
export { SessionStateManager, SessionState };
