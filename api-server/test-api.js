/**
 * BreadHub POS API - Test Suite
 * Quick tests to verify API is working correctly
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3001}/api`;
const API_KEY = process.env.API_KEY;

console.log('\n🧪 BreadHub POS API Test Suite\n');
console.log('='.repeat(60));
console.log(`Base URL: ${BASE_URL}`);
console.log(`API Key: ${API_KEY ? '✅ Found' : '❌ Missing'}`);
console.log('='.repeat(60));
console.log('');

let testsPassed = 0;
let testsFailed = 0;

async function testEndpoint(name, url, options = {}) {
  try {
    console.log(`Testing: ${name}`);
    console.log(`  URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'x-api-key': API_KEY,
        ...options.headers
      }
    });
    
    const data = await response.json();
    
    if (response.ok && data.success !== false) {
      console.log(`  ✅ PASS - Status: ${response.status}`);
      if (options.showData) {
        console.log(`  📊 Sample Data:`, JSON.stringify(data, null, 2).split('\n').slice(0, 10).join('\n'));
      }
      testsPassed++;
      return true;
    } else {
      console.log(`  ❌ FAIL - Status: ${response.status}`);
      console.log(`  Error:`, data);
      testsFailed++;
      return false;
    }
  } catch (error) {
    console.log(`  ❌ FAIL - ${error.message}`);
    testsFailed++;
    return false;
  } finally {
    console.log('');
  }
}

async function runTests() {
  console.log('Starting tests...\n');
  
  // Test 1: Health check (no auth required)
  await testEndpoint(
    'Health Check',
    `${BASE_URL}/health`,
    { headers: {} }
  );
  
  // Test 2: Sales summary (today)
  await testEndpoint(
    'Sales Summary - Today',
    `${BASE_URL}/sales/summary?period=today`,
    { showData: true }
  );
  
  // Test 3: Sales summary (week)
  await testEndpoint(
    'Sales Summary - Week',
    `${BASE_URL}/sales/summary?period=week`
  );
  
  // Test 4: Recent sales
  await testEndpoint(
    'Recent Sales (limit 5)',
    `${BASE_URL}/sales/recent?limit=5`,
    { showData: true }
  );
  
  // Test 5: Product performance
  await testEndpoint(
    'Product Performance - Today',
    `${BASE_URL}/products/performance?period=today&limit=10`
  );
  
  // Test 6: Active shifts
  await testEndpoint(
    'Active Shifts',
    `${BASE_URL}/shifts/active`,
    { showData: true }
  );
  
  // Test 7: Cashier performance
  await testEndpoint(
    'Cashier Performance - Today',
    `${BASE_URL}/cashiers/performance?period=today`
  );
  
  // Test 8: Authentication failure (no API key)
  console.log('Testing: Authentication Failure (should fail)');
  console.log(`  URL: ${BASE_URL}/sales/summary`);
  try {
    const response = await fetch(`${BASE_URL}/sales/summary`);
    if (response.status === 401) {
      console.log('  ✅ PASS - Correctly rejected unauthorized request');
      testsPassed++;
    } else {
      console.log('  ❌ FAIL - Should have returned 401');
      testsFailed++;
    }
  } catch (error) {
    console.log('  ❌ FAIL -', error.message);
    testsFailed++;
  }
  console.log('');
  
  // Summary
  console.log('='.repeat(60));
  console.log('Test Results:');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📊 Total: ${testsPassed + testsFailed}`);
  console.log('='.repeat(60));
  
  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! API is working correctly.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above.\n');
    process.exit(1);
  }
}

// Check if server is running
console.log('Checking if server is running...');
fetch(`${BASE_URL}/health`)
  .then(() => {
    console.log('✅ Server is running\n');
    runTests();
  })
  .catch(() => {
    console.log('❌ Server is not running!');
    console.log('\nPlease start the server first:');
    console.log('  npm start   or   npm run dev\n');
    process.exit(1);
  });
