/**
 * Test Queries for Notion Semantic Chunking Validation
 *
 * This file contains "gold standard" queries to validate the semantic chunking improvements.
 * Based on the proposed Notion semantic search MVP guide.
 *
 * Usage:
 *   node tests/notionSemanticChunkingTests.js
 *
 * Success Criteria:
 *   - Top-1 accuracy: 60% → 80%+ (semantic chunking impact)
 *   - Breadcrumb presence: 0% → 100% (heading path tracking)
 *   - Code query precision: +15% (block type filtering)
 */

import { ragService } from '../services/rag.js';
import { Conversation } from '../models/Conversation.js';

/**
 * Gold Standard Test Queries
 * Each query has an expected page/section that should appear in top results
 */
const GOLD_QUERIES = [
  // Exact matches (should benefit from BM25)
  {
    query: 'invoice above 5k',
    expectedPage: 'Invoice Approval Process',
    expectedSection: 'Approval Rules',
    type: 'exact_reference',
    description: 'Tests exact amount matching with keyword search',
  },
  {
    query: 'GDPR article 32',
    expectedPage: 'Privacy Policy',
    expectedSection: 'Security Measures',
    type: 'acronym',
    description: 'Tests acronym and legal reference matching',
  },
  {
    query: 'SOC2 compliance requirements',
    expectedPage: 'Security Compliance',
    expectedSection: 'Certifications',
    type: 'acronym',
    description: 'Tests technical acronym matching',
  },

  // Semantic queries (should benefit from vector search)
  {
    query: 'how do we cancel early?',
    expectedPage: 'Contract Termination',
    expectedSection: 'Early Exit Clauses',
    type: 'semantic',
    description: 'Tests natural language semantic understanding',
  },
  {
    query: 'rules for late payments',
    expectedPage: 'Billing Rules',
    expectedSection: 'Late Payment Penalties',
    type: 'semantic',
    description: 'Tests policy retrieval with semantic matching',
  },
  {
    query: 'who validates expenses',
    expectedPage: 'Finance Workflow',
    expectedSection: 'Approval Chain',
    type: 'semantic',
    description: 'Tests process understanding',
  },

  // Heading path tests (should show breadcrumb navigation)
  {
    query: 'data retention duration',
    expectedPage: 'GDPR Policy',
    expectedSection: 'Data Retention',
    expectedHeadingPath: ['Legal', 'Privacy', 'GDPR', 'Data Retention'],
    type: 'hierarchical',
    description: 'Tests heading path breadcrumb tracking',
  },

  // Code/technical content tests
  {
    query: 'authentication function implementation',
    expectedPage: 'API Documentation',
    expectedSection: 'Authentication',
    expectCodeBlock: true,
    type: 'code',
    description: 'Tests code block identification and retrieval',
  },

  // Table data tests
  {
    query: 'pricing tiers comparison',
    expectedPage: 'Pricing',
    expectedSection: 'Plans',
    expectTable: true,
    type: 'table',
    description: 'Tests table data retrieval',
  },

  // List/bullet point tests
  {
    query: 'onboarding checklist steps',
    expectedPage: 'Onboarding Guide',
    expectedSection: 'Checklist',
    expectList: true,
    type: 'list',
    description: 'Tests list/bullet point retrieval',
  },
];

/**
 * Test result tracking
 */
class TestResults {
  constructor() {
    this.results = [];
    this.metrics = {
      total: 0,
      top1Correct: 0,
      top3Correct: 0,
      top5Correct: 0,
      breadcrumbsFound: 0,
      codeBlocksIdentified: 0,
      tablesIdentified: 0,
      listsIdentified: 0,
      avgRank: 0,
    };
  }

  addResult(testQuery, retrievedDocs, topDoc) {
    this.results.push({
      query: testQuery.query,
      expectedPage: testQuery.expectedPage,
      type: testQuery.type,
      topDoc: topDoc?.metadata?.documentTitle || 'N/A',
      topDocHeadingPath: topDoc?.metadata?.heading_path || [],
      topDocBlockType: topDoc?.metadata?.block_type || 'unknown',
      topDocScore: topDoc?.score || 0,
      rank: this.findRank(retrievedDocs, testQuery.expectedPage),
      hasBreadcrumb: (topDoc?.metadata?.heading_path?.length || 0) > 0,
      isCode: topDoc?.metadata?.is_code || false,
      isTable: topDoc?.metadata?.is_table || false,
      isList: topDoc?.metadata?.is_list || false,
      allDocs: retrievedDocs.slice(0, 5).map((d) => ({
        title: d.metadata?.documentTitle || 'Unknown',
        headingPath: d.metadata?.heading_path || [],
        blockType: d.metadata?.block_type,
        score: d.score,
      })),
    });

    this.metrics.total++;

    // Check top-k accuracy
    const rank = this.findRank(retrievedDocs, testQuery.expectedPage);
    if (rank === 1) this.metrics.top1Correct++;
    if (rank <= 3) this.metrics.top3Correct++;
    if (rank <= 5) this.metrics.top5Correct++;

    // Track features
    if ((topDoc?.metadata?.heading_path?.length || 0) > 0) {
      this.metrics.breadcrumbsFound++;
    }
    if (topDoc?.metadata?.is_code) this.metrics.codeBlocksIdentified++;
    if (topDoc?.metadata?.is_table) this.metrics.tablesIdentified++;
    if (topDoc?.metadata?.is_list) this.metrics.listsIdentified++;

    this.metrics.avgRank += rank;
  }

  findRank(docs, expectedPage) {
    for (let i = 0; i < docs.length; i++) {
      const docTitle = docs[i].metadata?.documentTitle || '';
      if (docTitle.toLowerCase().includes(expectedPage.toLowerCase())) {
        return i + 1;
      }
    }
    return 999; // Not found
  }

  printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('SEMANTIC CHUNKING TEST RESULTS');
    console.log('='.repeat(80));

    console.log('\n📊 Overall Metrics:');
    console.log(`  Total Tests: ${this.metrics.total}`);
    console.log(
      `  Top-1 Accuracy: ${((this.metrics.top1Correct / this.metrics.total) * 100).toFixed(1)}% (${this.metrics.top1Correct}/${this.metrics.total})`
    );
    console.log(
      `  Top-3 Recall: ${((this.metrics.top3Correct / this.metrics.total) * 100).toFixed(1)}% (${this.metrics.top3Correct}/${this.metrics.total})`
    );
    console.log(
      `  Top-5 Recall: ${((this.metrics.top5Correct / this.metrics.total) * 100).toFixed(1)}% (${this.metrics.top5Correct}/${this.metrics.total})`
    );
    console.log(`  Avg Rank: ${(this.metrics.avgRank / this.metrics.total).toFixed(2)}`);

    console.log('\n🎯 Feature Detection:');
    console.log(
      `  Breadcrumbs Found: ${((this.metrics.breadcrumbsFound / this.metrics.total) * 100).toFixed(1)}% (${this.metrics.breadcrumbsFound}/${this.metrics.total})`
    );
    console.log(`  Code Blocks: ${this.metrics.codeBlocksIdentified}`);
    console.log(`  Tables: ${this.metrics.tablesIdentified}`);
    console.log(`  Lists: ${this.metrics.listsIdentified}`);

    console.log('\n📋 Detailed Results:');
    this.results.forEach((result, index) => {
      const success = result.rank <= 3 ? '✅' : '❌';
      console.log(`\n${success} Test ${index + 1}: ${result.query}`);
      console.log(`   Type: ${result.type}`);
      console.log(`   Expected: "${result.expectedPage}"`);
      console.log(
        `   Got: "${result.topDoc}" (Rank: ${result.rank === 999 ? 'Not Found' : result.rank})`
      );
      console.log(`   Block Type: ${result.topDocBlockType}`);
      console.log(
        `   Heading Path: ${result.topDocHeadingPath.length > 0 ? result.topDocHeadingPath.join(' › ') : 'None'}`
      );
      console.log(`   Score: ${result.topDocScore.toFixed(4)}`);

      if (result.rank > 3) {
        console.log('   Top 5 Results:');
        result.allDocs.forEach((doc, i) => {
          console.log(`     ${i + 1}. ${doc.title} (${doc.blockType}) - ${doc.score.toFixed(4)}`);
          if (doc.headingPath.length > 0) {
            console.log(`        Path: ${doc.headingPath.join(' › ')}`);
          }
        });
      }
    });

    console.log('\n' + '='.repeat(80));

    // Success criteria
    console.log('\n🎯 Success Criteria Check:');
    const top1Pct = (this.metrics.top1Correct / this.metrics.total) * 100;
    const breadcrumbPct = (this.metrics.breadcrumbsFound / this.metrics.total) * 100;

    console.log(
      `  Top-1 Accuracy ≥ 80%: ${top1Pct >= 80 ? '✅ PASS' : '❌ FAIL'} (${top1Pct.toFixed(1)}%)`
    );
    console.log(
      `  Breadcrumb Presence = 100%: ${breadcrumbPct === 100 ? '✅ PASS' : '❌ FAIL'} (${breadcrumbPct.toFixed(1)}%)`
    );

    console.log('\n' + '='.repeat(80));
  }

  saveToFile() {
    const fs = require('fs');
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `test-results-${timestamp}.json`;

    fs.writeFileSync(
      `tests/results/${filename}`,
      JSON.stringify({ metrics: this.metrics, results: this.results }, null, 2)
    );

    console.log(`\n💾 Results saved to: tests/results/${filename}`);
  }
}

/**
 * Run tests
 */
async function runTests() {
  console.log('🚀 Starting Semantic Chunking Tests...\n');

  const results = new TestResults();

  // Create test conversation
  const conversation = await Conversation.create({
    userId: 'test-user',
    title: 'Semantic Chunking Test',
    messageCount: 0,
  });

  for (const testQuery of GOLD_QUERIES) {
    console.log(`\n🔍 Testing: "${testQuery.query}" (${testQuery.type})`);

    try {
      // Use RAG service to get answer
      await ragService.askWithConversation(testQuery.query, conversation._id.toString());

      // Get the last retrieval results from logs
      // In a real implementation, you'd modify askWithConversation to return retrieved docs
      // For now, we'll make a direct retrieval call

      // Initialize if needed
      if (!ragService.retriever) {
        await ragService.init();
      }

      // Retrieve documents
      const retrievedDocs = await ragService.retriever.invoke(testQuery.query);

      // Re-rank with RRF
      const rerankedDocs = ragService.rerankDocuments(retrievedDocs, testQuery.query, 10);

      // Record results
      results.addResult(testQuery, rerankedDocs, rerankedDocs[0]);

      console.log(`   ✓ Top result: ${rerankedDocs[0]?.metadata?.documentTitle || 'N/A'}`);
      console.log(
        `   ✓ Heading path: ${rerankedDocs[0]?.metadata?.heading_path?.join(' › ') || 'None'}`
      );
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }

  // Print results
  results.printResults();

  // Save to file
  try {
    results.saveToFile();
  } catch {
    console.log('\n⚠️  Could not save results to file (tests/results/ directory may not exist)');
  }

  console.log('\n✅ Tests complete!\n');
  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

export { GOLD_QUERIES, TestResults, runTests };
