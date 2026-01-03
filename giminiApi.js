import fetch, { Headers, Request, Response } from 'node-fetch';
global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
global.Response = Response;
import { Blob } from 'fetch-blob';
global.Blob = Blob;

import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Polyfill for structuredClone
if (typeof structuredClone !== 'function') {
  global.structuredClone = obj => JSON.parse(JSON.stringify(obj));
}

const API_KEY = process.env.API_KEY;

const ai = new GoogleGenAI({
  apiKey: API_KEY,
  project: undefined,
  location: undefined,
  authClient: undefined
});

// 1. Define a fixed ID for your cache
const CACHE_ID = 'my-persistent-document-cache12';
const CACHE_META_PATH = path.resolve(process.cwd(), '.gemini_cache.json');
let cachedCacheName = null;
let cachedModelName = null;

async function loadCacheMeta() {
  try {
    const data = await fs.readFile(CACHE_META_PATH, 'utf-8');
    const { cacheName, modelName } = JSON.parse(data);
    cachedCacheName = cacheName;
    cachedModelName = modelName;
    return true;
  } catch {
    return false;
  }
}

async function saveCacheMeta(cacheName, modelName) {
  const data = JSON.stringify({ cacheName, modelName });
  await fs.writeFile(CACHE_META_PATH, data, 'utf-8');
}

// ✅ Automatically detect MIME type (supports .pdf and .txt)
function detectMimeType(filePath) {
  if (filePath.endsWith('.pdf')) return 'application/pdf';
  if (filePath.endsWith('.txt')) return 'text/plain';
  throw new Error('❌ Unsupported file type. Use .pdf or .txt only.');
}


async function cacheLocalDocument(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    const base64Data = fileBuffer.toString('base64');
    const mimeType = detectMimeType(filePath);

    // Use a model that supports tools (required for tools in cache)
    // gemini-3-pro-preview or gemini-2.5-pro support tools
    const modelName = 'gemini-3-pro-preview'; 
    console.log('Attempting to create new cache...');
    
    // IMPORTANT: Set a Time-To-Live (TTL). Default is 60 minutes.
    // If you set a longer TTL (e.g., 24 hours), the cache name will be valid for longer.
    // Using 24 hours (86400 seconds) to ensure cache persists
    const ttlHours = 24; 
    const ttlSeconds = ttlHours * 3600;

    const cache = await ai.caches.create({
        model: modelName,
        // The display name can be used to identify it later
        displayName: CACHE_ID,
        config: {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType, data: base64Data } }
                    ]
                }
            ],
            systemInstruction: 'You are an expert analyzing documents and generating insights.',
            // Tools must be in cache config when using cachedContent
            tools: [
                { googleSearch: {} },
                { urlContext: {} }
            ],
            ttl: `${ttlSeconds}s` 
        },
    });

  cachedCacheName = cache.name; // This is the full resource name
  cachedModelName = modelName;
  await saveCacheMeta(cache.name, modelName);
  console.log(`✅ Local ${mimeType} cached successfully with TTL of ${ttlHours} hours: ${cache.name}`);
  return { cache, modelName };
}

// ** The new, optimized function **
async function getOrCreateCache(filePath) {
    const desiredModelName = 'gemini-3-pro-preview'; // Match model used for creation
    let cacheName;
    let cache;
    
  // 1. Check if a cache name is already known (from a previous script run in memory or disk)
  if (!cachedCacheName || !cachedModelName) {
    await loadCacheMeta();
  }
  
  // 2. Check if we have a cached model name and if it matches the desired model
  // If model mismatch, we need to create a new cache
  if (cachedModelName && cachedModelName !== desiredModelName) {
    console.log(`⚠️ Model mismatch detected. Cached model: ${cachedModelName}, Desired model: ${desiredModelName}`);
    console.log(`⚠️ Will create a new cache with the correct model.`);
    cachedCacheName = null; // Force cache recreation
    cachedModelName = null;
  }
  
  if (cachedCacheName) {
    cacheName = cachedCacheName;
  }
  
  // 3. If a cache name is known and model matches, try to retrieve it
  if (cacheName && cachedModelName === desiredModelName) {
    try {
      cache = await ai.caches.get({ name: cacheName });
      if (cache) {
        console.log(`♻️ Found and reusing existing cache: ${cache.name}`);
        console.log(`♻️ Using model: ${cachedModelName}`);
        return { cache, modelName: cachedModelName };
      }
    } catch (e) {
      // The cache likely expired (TTL passed) or was deleted.
      console.log(`⚠️ Existing cache ${cacheName} not found or expired. Reason: ${e.message}`);
      // Fall through to creating a new one.
      cachedCacheName = null;
      cachedModelName = null;
    }
  }
  
  // 4. Create a new cache if retrieval failed, no name was known, or model mismatch
  console.log(`📝 Creating new cache with model: ${desiredModelName}`);
  const { cache: newCache, modelName: newModelName } = await cacheLocalDocument(filePath);
  return { cache: newCache, modelName: newModelName };
}

// Define Zod schema for structured email suggestions output
const suggestionSchema = z.object({
  id: z.string().describe("A unique identifier for the suggestion."),
  subject: z.string().describe("Reply subject aligned with the existing email thread."),
  text: z.string().describe("Complete email reply text written in proper email format. Must be exactly 1 line (no line breaks)."),
  confidence: z.enum(["High", "Medium"]).describe("Confidence level of the suggestion - one with High confidence and one with Medium confidence.")
});

// Schema expects an array of exactly 2 suggestions - one High and one Medium confidence
const suggestionsResponseSchema = z.array(suggestionSchema)
  .min(2)
  .max(2)
  .describe("Array of exactly 2 email reply suggestions - one with High confidence and one with Medium confidence.");

const schemaIs = zodToJsonSchema(suggestionsResponseSchema)
console.log("schemaIs",schemaIs)

export async function generateSuggestions(userMessage) {
  try {
    const filePath = path.resolve(process.cwd(), 'sample.txt'); // ✅ use PDF or TXT

    const { cache, modelName } = await getOrCreateCache(filePath);
    
    // Log cache info for debugging
    console.log(`📝 Using cache: ${cache.name}`);
    console.log(`📝 Using model: ${modelName}`);

    // Use the same model as the cache (required when using cachedContent)
    // The model must match between cache creation and generation
    const modelForGeneration = modelName; // Use same model as cache

    // Generate structured response
    // Note: tools and systemInstruction are in the cache, not here
    // When using cachedContent, tools/systemInstruction must be in cache config
    const response = await ai.models.generateContent({
      model: modelForGeneration,
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Based on the cached document and this input: "${userMessage}", generate exactly 2 professional email reply suggestions that are contextually appropriate and based on the document content.

IMPORTANT: You must provide exactly 2 suggestions:
- One suggestion with "High" confidence level
- One suggestion with "Medium" confidence level

Each suggestion must have:
- A proper subject line
- Complete email text in proper format (including greeting, body, and closing) - MUST be exactly 1 line with no line breaks` }
          ]
        }
      ],
      config: { 
        cachedContent: cache.name,
        // Structured output configuration - ensures response matches the schema
        // Note: tools are already in the cache config, not here
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(suggestionsResponseSchema)
      },
    });

    console.log("response \n\n\n",response.text)
    // Parse the structured response
    let responseText;
    try {
      responseText = response.text || response.response?.text() || String(response);
      const jsonData = JSON.parse(responseText);
      
      // Handle both array response and object with suggestions property
      let suggestionsArray;
      if (Array.isArray(jsonData)) {
        suggestionsArray = jsonData;
      } else if (jsonData.suggestions && Array.isArray(jsonData.suggestions)) {
        suggestionsArray = jsonData.suggestions;
      } else {
        throw new Error('Response is not an array or object with suggestions array');
      }
      
      // Log the raw response for debugging
      console.log('📋 Raw suggestions array:', JSON.stringify(suggestionsArray, null, 2));
      
      // Check and fix missing fields - handle alternative field names
      const normalizedSuggestions = suggestionsArray.map((s, idx) => {
        // Check for alternative field names for text/email body
        const textValue = s.text || s.Text || s.body || s.Body || s.content || s.Content || 
                         s.message || s.Message || s.email || s.Email || 
                         s.email_body || s.emailBody || s.EmailBody || s.email_body_text;
        
        if (!textValue) {
          console.error(`❌ Suggestion ${idx + 1} is missing the 'text' field!`);
          console.error(`   Available fields:`, Object.keys(s));
          console.error(`   Full object:`, JSON.stringify(s, null, 2));
          throw new Error(`Suggestion ${idx + 1} is missing required 'text' field. Available fields: ${Object.keys(s).join(', ')}`);
        }
        
        // Handle confidence - check for confidence_score and convert to High/Medium
        let confidenceValue = s.confidence || s.Confidence;
        
        // If we have confidence_score, convert it to High or Medium
        if (!confidenceValue && (s.confidence_score !== undefined || s.confidenceScore !== undefined)) {
          const score = s.confidence_score || s.confidenceScore;
          // If it's a number, assume > 0.7 is High, otherwise Medium
          // If it's a string like "high" or "medium", convert it
          if (typeof score === 'number') {
            confidenceValue = score > 0.7 ? 'High' : 'Medium';
          } else if (typeof score === 'string') {
            const scoreLower = score.toLowerCase();
            confidenceValue = (scoreLower.includes('high') || scoreLower.includes('0.8') || scoreLower.includes('0.9') || scoreLower.includes('1.0')) ? 'High' : 'Medium';
          } else {
            confidenceValue = 'Medium';
          }
        }
        
        // Fallback to confidenceLevel or default
        if (!confidenceValue) {
          if (s.confidenceLevel) {
            confidenceValue = (s.confidenceLevel === 'high' || s.confidenceLevel === 'High') ? 'High' : 'Medium';
          } else {
            confidenceValue = 'Medium';
          }
        }
        
        // Ensure text is exactly 1 line (replace newlines and multiple spaces with single space)
        const normalizedText = String(textValue)
          .replace(/\r\n/g, ' ')  // Replace Windows line breaks
          .replace(/\n/g, ' ')    // Replace Unix line breaks
          .replace(/\r/g, ' ')    // Replace old Mac line breaks
          .replace(/\s+/g, ' ')   // Replace multiple spaces with single space
          .trim();                // Remove leading/trailing whitespace
        
        const normalized = {
          id: s.id || s.ID || `suggestion_${idx + 1}`,
          subject: s.subject || s.Subject || s.title || s.Title || 'No Subject',
          text: normalizedText,
          confidence: confidenceValue
        };
        
        // Log if text was normalized from multi-line to single line
        if (textValue !== normalizedText) {
          console.log(`📝 Suggestion ${idx + 1}: Normalized text from multi-line to single line`);
        }
        
        // Log if we had to use fallbacks for other fields
        const usedFallbacks = [];
        if (!s.id && normalized.id.startsWith('suggestion_')) usedFallbacks.push('id');
        if (!s.subject || normalized.subject === 'No Subject') usedFallbacks.push('subject');
        if (s.confidence !== normalized.confidence && s.confidence_score === undefined) usedFallbacks.push('confidence');
        if (s.confidence_score !== undefined) {
          console.log(`📊 Suggestion ${idx + 1}: Converted confidence_score (${s.confidence_score}) to ${normalized.confidence}`);
        }
        if (s.email_body && !s.text) {
          console.log(`📧 Suggestion ${idx + 1}: Using 'email_body' field for text`);
        }
        if (usedFallbacks.length > 0) {
          console.warn(`⚠️ Suggestion ${idx + 1} used fallbacks for:`, usedFallbacks);
        }
        
        return normalized;
      });
      
      // Validate the normalized array against the schema
      const parsedResponse = suggestionsResponseSchema.parse(normalizedSuggestions);
      
      // Validate that we have exactly one High and one Medium confidence
      const confidenceLevels = parsedResponse.map(s => s.confidence);
      const highCount = confidenceLevels.filter(c => c === 'High').length;
      const mediumCount = confidenceLevels.filter(c => c === 'Medium').length;
      
      if (highCount !== 1 || mediumCount !== 1) {
        console.warn(`⚠️ Confidence level mismatch: High=${highCount}, Medium=${mediumCount}`);
        console.warn(`   Expected: exactly 1 High and 1 Medium`);
        console.warn(`   Current suggestions:`, parsedResponse.map(s => ({ id: s.id, confidence: s.confidence })));
        
        // Fix the confidence levels if needed
        if (parsedResponse.length >= 2) {
          parsedResponse[0].confidence = 'High';
          parsedResponse[1].confidence = 'Medium';
          console.log(`✅ Fixed confidence levels: first suggestion set to High, second set to Medium`);
        }
      }
      
      return {
        success: true,
        suggestions: parsedResponse,
        usageMetadata: response.usageMetadata || response.response?.usageMetadata
      };
    } catch (parseError) {
      console.error('❌ Error parsing structured response:', parseError);
      console.error('❌ Raw response:', responseText);
      throw new Error(`Failed to parse structured response: ${parseError.message}`);
    }
  } catch (error) {
    console.error('❌ Error generating suggestions:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return { 
      success: false, 
      error: "AI Processing Error", 
      message: error.message || String(error)
    };
  }
}
