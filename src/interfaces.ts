import { ChatMessage } from "./init.ts";

type StreamChatOptions = {
  messages: Array<ChatMessage>;
  stream: boolean;
  onDataReceived?: (data: any) => void;
};

interface AIServiceInterface {
    streamChatWithAI(messages: Array<ChatMessage>): Promise<void>;
    chatWithAI(systemMessage: string, userMessages: Array<{ role: string; content: string }>): Promise<any>;
    generateImage(prompt: string, n: number, size: string, quality: string): Promise<any>;
}

interface ProviderInterface {
    name: string;
    apiKey: string;
    baseUrl: string;
    modelName: string;
    chatWithAI: (options: StreamChatOptions) => Promise<any>;
}

interface ModelInterface {
    name: string;
    provider: ProviderInterface;
}