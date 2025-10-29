import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faRedo, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import './Chat.css';
import AnthropicMCPHttpClient from '../services/AnthropicMcpHttpClient';
import OpenAIMCPHttpClient from '../services/OpenAIMcpHttpClient';

const initialMessages = [
    {
        id: 'assistant-intro',
        role: 'assistant',
        content: "Hi, I'm your MCP guide. Ask me anything about the demo and I'll walk you through it."
    }
];

export default function Chat() {
    const [messages, setMessages] = useState(initialMessages);
    const [selectedProvider, setSelectedProvider] = useState('anthropic');
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
    const scrollAnchorRef = useRef(null);
    const mcpClientRef = useRef(null);
    const connectingRef = useRef(false);
    const latestProviderRef = useRef('anthropic');
    const providerDropdownRef = useRef(null);
    // const serverUrl = process.env.REACT_APP_MCP_SERVER_URL || 'http://localhost:3001/mcp';
    const serverUrl = process.env.REACT_APP_MCP_SERVER_URL || 'http://localhost:3002/mcp';
    const anthropicApiKey = process.env.REACT_APP_ANTHROPIC_API_KEY || (typeof window !== 'undefined' ? window.REACT_APP_ANTHROPIC_API_KEY : undefined);
    const openaiApiKey = process.env.REACT_APP_OPENAI_API_KEY || (typeof window !== 'undefined' ? window.REACT_APP_OPENAI_API_KEY : undefined);

    useEffect(() => {
        if (scrollAnchorRef.current) {
            scrollAnchorRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    useEffect(() => {
        if (!isProviderMenuOpen) {
            return;
        }
        const handleClickOutside = (event) => {
            if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target)) {
                setIsProviderMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isProviderMenuOpen]);

    useEffect(() => {
        return () => {
            if (mcpClientRef.current) {
                mcpClientRef.current.cleanup().catch((error) => {
                    console.error('Failed to cleanup MCP client:', error);
                });
                mcpClientRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        latestProviderRef.current = selectedProvider;
        setMessages(() => [...initialMessages]);
        setInputValue('');
        setIsLoading(false);
        connectingRef.current = false;
        setIsProviderMenuOpen(false);

        if (mcpClientRef.current) {
            const client = mcpClientRef.current;
            mcpClientRef.current = null;
            client.cleanup().catch((error) => {
                console.error('Failed to cleanup MCP client on provider change:', error);
            });
        }
    }, [selectedProvider]);

    const ensureClient = useCallback(async () => {
        const requestedProvider = selectedProvider;
        if (mcpClientRef.current && mcpClientRef.current.provider === requestedProvider) {
            return mcpClientRef.current;
        }
        if (mcpClientRef.current && mcpClientRef.current.provider !== requestedProvider) {
            const existingClient = mcpClientRef.current;
            mcpClientRef.current = null;
            await existingClient.cleanup().catch((error) => {
                console.error('Failed to cleanup MCP client:', error);
            });
        }
        if (connectingRef.current) {
            await new Promise((resolve) => {
                const check = () => {
                    if (!connectingRef.current) {
                        resolve();
                    } else {
                        setTimeout(check, 50);
                    }
                };
                check();
            });
            if (mcpClientRef.current && mcpClientRef.current.provider === requestedProvider) {
                return mcpClientRef.current;
            }
        }
        connectingRef.current = true;
        try {
            if (!serverUrl) {
                throw new Error('MCP server URL is required. Set REACT_APP_MCP_SERVER_URL in your environment.');
            }
            let client;
            if (requestedProvider === 'anthropic') {
                if (!anthropicApiKey) {
                    throw new Error('Anthropic API key is required. Set REACT_APP_ANTHROPIC_API_KEY in your environment.');
                }
                client = new AnthropicMCPHttpClient({
                    anthropicOptions: {
                        apiKey: anthropicApiKey
                    }
                });
            } else {
                if (!openaiApiKey) {
                    throw new Error('OpenAI API key is required. Set REACT_APP_OPENAI_API_KEY in your environment.');
                }
                client = new OpenAIMCPHttpClient({
                    openaiOptions: {
                        apiKey: openaiApiKey
                    }
                });
            }
            await client.connect(serverUrl);
            if (latestProviderRef.current !== requestedProvider) {
                await client.cleanup().catch((error) => {
                    console.warn('Provider changed during connection, cleanup failed:', error);
                });
                return mcpClientRef.current;
            }
            client.provider = requestedProvider;
            mcpClientRef.current = client;
            return client;
        } catch (error) {
            console.error('Failed to connect to MCP server:', error);
            throw error;
        } finally {
            connectingRef.current = false;
        }
    }, [serverUrl, anthropicApiKey, openaiApiKey, selectedProvider]);

    const executeMcpCall = useCallback(async (userContent) => {
        const placeholderId = `assistant-${Date.now()}`;
        setMessages(prev => [
            ...prev,
            {
                id: placeholderId,
                role: 'assistant',
                content: 'Connecting to the MCP server…',
                placeholder: true
            }
        ]);
        try {
            const client = await ensureClient();
            if (!client) {
                throw new Error('MCP client unavailable');
            }
            const response = await client.processQuery(userContent);
            setMessages(prev => prev.map(message => {
                if (message.id !== placeholderId) {
                    return message;
                }
                return {
                    ...message,
                    content: response || 'The MCP server returned an empty response.',
                    placeholder: false
                };
            }));
            setIsLoading(false);
        } catch (error) {
            console.error('Failed to process MCP query:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            setMessages(prev => prev.map(message => {
                if (message.id !== placeholderId) {
                    return message;
                }
                return {
                    ...message,
                    content: `Error from MCP: ${errorMessage}`,
                    placeholder: false
                };
            }));
            setIsLoading(false);
        }
    }, [ensureClient]);

    const handleProviderSelect = useCallback((provider) => {
        setSelectedProvider(provider);
        setIsProviderMenuOpen(false);
    }, []);

    const handleReset = () => {
        setMessages(() => [...initialMessages]);
        setInputValue('');
        setIsLoading(false);
        connectingRef.current = false;
        setIsProviderMenuOpen(false);
        if (mcpClientRef.current) {
            const client = mcpClientRef.current;
            mcpClientRef.current = null;
            client.cleanup().catch((error) => {
                console.error('Failed to cleanup MCP client during refresh:', error);
            });
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSubmit(event);
        }
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        const trimmed = inputValue.trim();
        if (!trimmed) {
            return;
        }
        const userMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: trimmed
        };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);
        executeMcpCall(trimmed);
    };

    return (
        <div className="card bg-dark text-light d-flex flex-column chat-shell">
            <div className="card-body d-flex flex-column gap-3 overflow-auto chat-body">
                {messages.map(message => (
                    <div key={message.id} className={`d-flex ${message.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`} >
                        <div className={`px-3 py-2 chat-message-bubble ${message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant' }`}>
                            {message.content}
                        </div>
                    </div>
                ))}
                <div ref={scrollAnchorRef} />
            </div>
            <form className="p-3 chat-input-area" onSubmit={handleSubmit} onReset={handleReset}>
                <div className="mb-3">
                    <textarea
                        rows={1}
                        className="form-control border-0 bg-transparent text-light chat-input"
                        placeholder="Message the MCP assistant…"
                        value={inputValue}
                        onChange={event => setInputValue(event.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>
                <div className="d-flex flex-wrap justify-content-end align-items-center gap-2">
                    <div className="d-flex align-items-center gap-1 text-light text-uppercase small">
                        <span>Provider:</span>
                        <span>{selectedProvider === 'anthropic' ? 'Anthropic' : 'OpenAI'}</span>
                    </div>
                    <div
                        ref={providerDropdownRef}
                        className={`dropdown ${isProviderMenuOpen ? 'show' : ''}`}
                    >
                        <button
                            type="button"
                            className="btn btn-light rounded-circle d-flex align-items-center justify-content-center chat-btn"
                            onClick={() => setIsProviderMenuOpen((prev) => !prev)}
                            aria-haspopup="true"
                            aria-expanded={isProviderMenuOpen}
                            aria-label="Select provider"
                        >
                            <FontAwesomeIcon icon={faChevronDown} />
                        </button>
                        <div className={`dropdown-menu dropdown-menu-end dropdown-menu-dark ${isProviderMenuOpen ? 'show' : ''}`}>
                            <button
                                type="button"
                                className={`dropdown-item${selectedProvider === 'anthropic' ? ' active' : ''}`}
                                onClick={() => handleProviderSelect('anthropic')}
                            >
                                Anthropic
                            </button>
                            <button
                                type="button"
                                className={`dropdown-item${selectedProvider === 'openai' ? ' active' : ''}`}
                                onClick={() => handleProviderSelect('openai')}
                            >
                                OpenAI
                            </button>
                        </div>
                    </div>
                    <button
                        type="reset"
                        className="btn btn-light rounded-circle d-flex align-items-center justify-content-center chat-btn"
                        disabled={isLoading}
                        aria-label="Refresh conversation">
                        <FontAwesomeIcon icon={faRedo} />
                    </button>
                    <button
                        type="submit"
                        className="btn btn-light rounded-circle d-flex align-items-center justify-content-center chat-btn"
                        disabled={isLoading || !inputValue.trim()}
                        aria-label="Send message">
                        <FontAwesomeIcon icon={faArrowUp} />
                    </button>
                </div>
            </form>
        </div>
    );
}
