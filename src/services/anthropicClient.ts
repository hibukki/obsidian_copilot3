import { requestUrl } from 'obsidian';
import { 
	AnthropicClientConfig, 
	AnthropicRequestBody, 
	AnthropicResponse, 
	AnthropicErrorResponse 
} from '../types';

export class AnthropicClient {
	private config: AnthropicClientConfig;
	private readonly baseUrl = "https://api.anthropic.com/v1/messages";
	private readonly apiVersion = "2023-06-01";

	constructor(config: AnthropicClientConfig) {
		this.config = config;
	}

	/**
	 * Query Claude for feedback based on the provided prompt
	 * @param prompt The prompt to send to Claude
	 * @param maxTokens Maximum number of tokens in the response (default: 500)
	 * @returns The feedback text from Claude
	 * @throws Error if the API request fails
	 */
	async queryForFeedback(prompt: string, maxTokens: number = 500): Promise<string> {
		const requestBody: AnthropicRequestBody = {
			model: this.config.model,
			max_tokens: maxTokens,
			messages: [
				{
					role: "user",
					content: prompt
				}
			]
		};

		// Log the curl command for debugging
		const curlCommand = `curl ${this.baseUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${this.config.apiKey.substring(0, 10)}..." \\
  -H "anthropic-version: ${this.apiVersion}" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

		console.log("Claude API Request (as curl):", curlCommand);
		console.log("Full request body:", requestBody);

		try {
			const response = await requestUrl({
				url: this.baseUrl,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.config.apiKey,
					"anthropic-version": this.apiVersion
				},
				body: JSON.stringify(requestBody)
			});

			if (response.status !== 200) {
				await this.handleErrorResponse(response);
			}

			const data: AnthropicResponse = JSON.parse(response.text);
			console.log("Claude API Success Response:", data);
			
			return data.content[0]?.text || "No feedback available";

		} catch (error) {
			console.error("Claude API Error:", error);
			throw this.formatError(error);
		}
	}

	/**
	 * Handle error responses from the Anthropic API
	 */
	private async handleErrorResponse(response: any): Promise<never> {
		console.error("Claude API Error - Full Response:");
		console.error("Status:", response.status);
		console.error("Response Headers:", response.headers);
		console.error("Response Body (raw):", response.text);

		let errorData: AnthropicErrorResponse;
		try {
			errorData = JSON.parse(response.text);
			console.error("Response Body (parsed):", errorData);
		} catch {
			errorData = { error: { message: response.text, type: "unknown" } };
			console.error("Failed to parse response as JSON");
		}

		const errorMessage = errorData.error?.message || response.text || `API Error: ${response.status}`;
		throw new Error(`HTTP ${response.status}: ${errorMessage}`);
	}

	/**
	 * Format error messages for better user experience
	 */
	private formatError(error: unknown): Error {
		if (error instanceof Error) {
			if (error.message === "Failed to fetch") {
				const detailedMessage = "Failed to fetch - This could be a CORS issue. Check console for details.";
				console.error("Fetch failed - possible causes:");
				console.error("1. CORS blocking (Obsidian may need to whitelist api.anthropic.com)");
				console.error("2. Network connectivity issue");
				console.error("3. Invalid API endpoint");
				return new Error(detailedMessage);
			}
			return error;
		}
		
		return new Error("Unknown error occurred");
	}

	/**
	 * Update the client configuration
	 */
	updateConfig(config: Partial<AnthropicClientConfig>): void {
		this.config = { ...this.config, ...config };
	}
}