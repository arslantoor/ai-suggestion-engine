# AI Suggestion Service

## Project Description

The AI Suggestion Service is a Node.js application that leverages the Google Gemini API to provide intelligent, context-aware email reply suggestions. It can cache documents (e.g., PDF or TXT files) to inform its responses, generating structured suggestions with varying confidence levels (High/Medium).

## Features

*   **AI-Powered Suggestions:** Generates email reply suggestions using the Google Gemini API.
*   **Document Caching:** Caches reference documents (PDF, TXT) to provide context for suggestions, improving relevance and accuracy.
*   **Structured Output:** Provides suggestions in a structured JSON format, including subject, reply text, and a confidence level.
*   **Express.js API:** Exposes a simple RESTful API endpoint for integrating suggestion generation into other applications.
*   **Environment Configuration:** Uses `.env` files for secure API key and port management.

## Technologies Used

*   **Node.js:** JavaScript runtime environment.
*   **Express.js:** Web application framework for Node.js.
*   **Google Gemini API (`@google/genai`):** For AI model interaction and content generation.
*   **`dotenv`:** To load environment variables from a `.env` file.
*   **`zod` & `zod-to-json-schema`:** For schema definition and validation of AI responses.
*   **`node-fetch`:** For making HTTP requests (used internally by `@google/genai`).
*   **`fs/promises` & `path`:** For file system operations (document caching).

## Setup and Installation

To get started with the AI Suggestion Service, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd omni-ai-suggestion
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root directory of the project and add your Google Gemini API key and desired port:

    ```env
    GOOGLE_API_KEY="YOUR_GEMINI_API_KEY"
    PORT=3000
    ```
    **Note:** Replace `"YOUR_GEMINI_API_KEY"` with your actual API key from the Google Cloud Console. The `API_KEY` in `giminiApi.js` is currently hardcoded and should be replaced with `process.env.GOOGLE_API_KEY` for better security practices.

4.  **Prepare Reference Document:**
    Place your reference document (e.g., `sample.txt` or a PDF file) in the project root directory. The `giminiApi.js` currently uses `sample.txt` by default.

5.  **Run the application:**
    ```bash
    node server.js
    ```
    The server will start and listen on the specified port (default: 3000).

## API Endpoint

The service exposes a single POST endpoint for generating suggestions:

### `POST /api/generate`

Generates email reply suggestions based on a user message and a cached document.

*   **URL:** `http://localhost:3000/api/generate` (replace `3000` with your configured port)
*   **Method:** `POST`
*   **Content-Type:** `application/json`

#### Request Body

```json
{
  "message": "The user's input message for which suggestions are needed."
}
```

#### Example Request

```bash
curl -X POST -H "Content-Type: application/json" -d '{ "message": "What is the policy for refunds?" }' http://localhost:3000/api/generate
```

#### Example Success Response

```json
{
  "success": true,
  "message": "Suggestions generated successfully",
  "suggestions": [
    {
      "id": "suggestion_1",
      "subject": "Regarding Your Refund Inquiry",
      "text": "Dear Customer, Thank you for reaching out. Based on our policy, refunds are processed within 5-7 business days of approval. Please let us know if you have any further questions. Sincerely, Support Team",
      "confidence": "High"
    },
    {
      "id": "suggestion_2",
      "subject": "Follow-up on Refund Status",
      "text": "Hello, We are looking into your refund request. We will provide an update within 24 hours. Thank you for your patience. Best regards, Customer Service",
      "confidence": "Medium"
    }
  ],
  "usageMetadatata": {
    "promptTokenCount": 50,
    "candidatesTokenCount": 100
  },
  "timestamp": "2026-01-03T12:00:00.000Z"
}
```

#### Example Error Response (Bad Request)

```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Message is required in the request body"
}
```

#### Example Error Response (Internal Server Error)

```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Details about the internal server error"
}
```

## Caching Mechanism

The service uses Google Gemini's document caching feature to store and retrieve contextual information from specified documents (e.g., `sample.txt`).

*   **Cache ID:** A fixed ID (`my-persistent-document-cache12`) is used to manage the cache.
*   **Cache Metadata:** Cache details (name, model) are persisted in `.gemini_cache.json` to allow reuse across application restarts.
*   **Time-To-Live (TTL):** The cache is configured with a TTL of 24 hours, meaning the cached content will be valid for that duration before requiring recreation.
*   **Supported Document Types:** Currently supports `.pdf` and `.txt` files for caching.

## Contributing

Feel free to fork the repository, make improvements, and submit pull requests.

## License

This project is open-sourced under the MIT License.

