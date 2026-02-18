package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// OllamaProvider implements Provider and ToolProvider for the Ollama API
type OllamaProvider struct {
	baseURL string
	client  *http.Client
}

// Verify interface compliance
var _ ToolProvider = (*OllamaProvider)(nil)

// NewOllamaProvider creates a new Ollama provider
func NewOllamaProvider(baseURL string) *OllamaProvider {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	return &OllamaProvider{
		baseURL: baseURL,
		client: &http.Client{
			Timeout: 5 * time.Minute, // Long timeout for generation
		},
	}
}

func (p *OllamaProvider) Name() string { return "ollama" }

func (p *OllamaProvider) Available() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", p.baseURL+"/api/tags", nil)
	resp, err := p.client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func (p *OllamaProvider) Models() []ModelInfo {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", p.baseURL+"/api/tags", nil)
	resp, err := p.client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var result struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil
	}

	models := make([]ModelInfo, len(result.Models))
	for i, m := range result.Models {
		models[i] = ModelInfo{ID: m.Name, Name: m.Name}
	}
	return models
}

func (p *OllamaProvider) ChatStream(ctx context.Context, messages []Message, opts ChatOptions) (<-chan StreamChunk, error) {
	return p.doStream(ctx, messages, nil, opts)
}

func (p *OllamaProvider) ChatStreamWithTools(ctx context.Context, messages []Message, tools []ToolDefinition, opts ChatOptions) (<-chan StreamChunk, error) {
	return p.doStream(ctx, messages, tools, opts)
}

func (p *OllamaProvider) ChatStreamWithToolResults(ctx context.Context, messages []Message, toolCalls []ToolCall, results []ToolResult, tools []ToolDefinition, opts ChatOptions) (<-chan StreamChunk, error) {
	// Build extended message list with assistant tool calls and tool results
	extended := make([]Message, len(messages))
	copy(extended, messages)

	// Add assistant message with tool calls
	extended = append(extended, Message{Role: "assistant", Content: ""})

	// Add tool result messages
	for _, r := range results {
		extended = append(extended, Message{
			Role:       "tool",
			Content:    r.Content,
			ToolCallID: r.ToolCallID,
		})
	}

	return p.doStreamWithToolHistory(ctx, extended, toolCalls, tools, opts)
}

// doStream is the core streaming implementation with optional tool support
func (p *OllamaProvider) doStream(ctx context.Context, messages []Message, tools []ToolDefinition, opts ChatOptions) (<-chan StreamChunk, error) {
	model := opts.Model
	if model == "" {
		model = "llama3.2"
	}

	ollamaMessages := buildOllamaMessages(messages)

	body := map[string]any{
		"model":    model,
		"messages": ollamaMessages,
		"stream":   true,
	}

	if opts.Temperature > 0 {
		body["options"] = map[string]any{
			"temperature": opts.Temperature,
		}
	}
	if len(tools) > 0 {
		body["tools"] = ollamaToolDefs(tools)
	}

	return p.sendAndStream(ctx, body)
}

// doStreamWithToolHistory handles the continuation after tool execution
func (p *OllamaProvider) doStreamWithToolHistory(ctx context.Context, messages []Message, toolCalls []ToolCall, tools []ToolDefinition, opts ChatOptions) (<-chan StreamChunk, error) {
	model := opts.Model
	if model == "" {
		model = "llama3.2"
	}

	// Build messages with tool call history in Ollama format
	var ollamaMessages []map[string]any
	for _, m := range messages {
		if m.Role == "assistant" && m.Content == "" {
			// Assistant message with tool calls
			ollamaToolCalls := make([]map[string]any, len(toolCalls))
			for i, tc := range toolCalls {
				// Parse the arguments JSON string back to a map
				var args map[string]any
				if err := json.Unmarshal([]byte(tc.Arguments), &args); err != nil {
					args = map[string]any{}
				}
				ollamaToolCalls[i] = map[string]any{
					"function": map[string]any{
						"name":      tc.Name,
						"arguments": args,
					},
				}
			}
			ollamaMessages = append(ollamaMessages, map[string]any{
				"role":       "assistant",
				"content":    "",
				"tool_calls": ollamaToolCalls,
			})
		} else if m.Role == "tool" {
			ollamaMessages = append(ollamaMessages, map[string]any{
				"role":    "tool",
				"content": m.Content,
			})
		} else {
			ollamaMessages = append(ollamaMessages, map[string]any{
				"role":    m.Role,
				"content": m.Content,
			})
		}
	}

	body := map[string]any{
		"model":    model,
		"messages": ollamaMessages,
		"stream":   true,
	}

	if opts.Temperature > 0 {
		body["options"] = map[string]any{
			"temperature": opts.Temperature,
		}
	}
	if len(tools) > 0 {
		body["tools"] = ollamaToolDefs(tools)
	}

	return p.sendAndStream(ctx, body)
}

func (p *OllamaProvider) sendAndStream(ctx context.Context, body map[string]any) (<-chan StreamChunk, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/api/chat", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama request failed: %w", err)
	}

	if resp.StatusCode != 200 {
		errBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("ollama error %d: %s", resp.StatusCode, string(errBody))
	}

	ch := make(chan StreamChunk, 32)
	go func() {
		defer close(ch)
		defer resp.Body.Close()

		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 64*1024), 64*1024)

		var pendingToolCalls []ToolCall

		for scanner.Scan() {
			line := scanner.Bytes()
			if len(line) == 0 {
				continue
			}

			var chunk struct {
				Message struct {
					Content   string `json:"content"`
					ToolCalls []struct {
						Function struct {
							Name      string         `json:"name"`
							Arguments map[string]any `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"message"`
				Done bool `json:"done"`
			}
			if err := json.Unmarshal(line, &chunk); err != nil {
				continue
			}

			// Collect tool calls from the chunk
			for i, tc := range chunk.Message.ToolCalls {
				argsJSON, _ := json.Marshal(tc.Function.Arguments)
				pendingToolCalls = append(pendingToolCalls, ToolCall{
					ID:        fmt.Sprintf("ollama_%s_%d", tc.Function.Name, i+len(pendingToolCalls)),
					Name:      tc.Function.Name,
					Arguments: string(argsJSON),
				})
			}

			// Stream content
			if chunk.Message.Content != "" {
				select {
				case ch <- StreamChunk{Content: chunk.Message.Content}:
				case <-ctx.Done():
					return
				}
			}

			if chunk.Done {
				// If we have pending tool calls, send them instead of done
				if len(pendingToolCalls) > 0 {
					select {
					case ch <- StreamChunk{ToolCalls: pendingToolCalls}:
					case <-ctx.Done():
					}
					return
				}
				select {
				case ch <- StreamChunk{Done: true}:
				case <-ctx.Done():
				}
				return
			}
		}
	}()

	return ch, nil
}

func buildOllamaMessages(messages []Message) []map[string]any {
	result := make([]map[string]any, 0, len(messages))
	for _, m := range messages {
		msg := map[string]any{
			"role":    m.Role,
			"content": m.Content,
		}
		result = append(result, msg)
	}
	return result
}

func ollamaToolDefs(tools []ToolDefinition) []map[string]any {
	result := make([]map[string]any, len(tools))
	for i, t := range tools {
		// Strip "additionalProperties" from parameters since Ollama doesn't handle it well
		params := make(map[string]any)
		for k, v := range t.Parameters {
			if k != "additionalProperties" {
				params[k] = v
			}
		}
		result[i] = map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        t.Name,
				"description": t.Description,
				"parameters":  params,
			},
		}
	}
	return result
}

