import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faRedo, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import './chat.css';
import { sendChatRequest } from '../services/controlTowerApi';

const initialMessages = [
    {
        id: 'assistant-intro',
        role: 'assistant',
        content: "Hi, I'm your MCP guide. Ask me anything about the demo and I'll walk you through it."
    }
];

const PROVIDERS = [
    { id: 'google', label: 'Google', disabled: false },
    { id: 'openai', label: 'OpenAI', disabled: true },
    { id: 'anthropic', label: 'Anthropic', disabled: true }
];
const PROVIDER_ID = 'google';
const PROVIDER_LABEL = 'Google';

export default function Chat() {
    const [messages, setMessages] = useState(initialMessages);
    const [selectedProvider] = useState(PROVIDER_ID);
    const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollAnchorRef = useRef(null);
    const providerDropdownRef = useRef(null);
    const sessionIdsRef = useRef({});

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

    const getSessionId = useCallback((provider) => {
        const rand =
            typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : Date.now();
        if (!sessionIdsRef.current[provider]) {
            sessionIdsRef.current[provider] = `session-${provider}-${rand}`;
        }
        return sessionIdsRef.current[provider];
    }, []);

    const executeChat = useCallback(async (userContent) => {
        const placeholderId = `assistant-${Date.now()}`;
        setMessages(prev => [
            ...prev,
            {
                id: placeholderId,
                role: 'assistant',
                content: `Thinking with ${PROVIDER_LABEL} agent…`,
                placeholder: true
            }
        ]);
        try {
            const content = await sendChatRequest({
                message: userContent,
                provider: selectedProvider,
                sessionId: getSessionId(selectedProvider)
            });
            setMessages(prev => prev.map(message => {
                if (message.id !== placeholderId) {
                    return message;
                }
                return {
                    ...message,
                    content: content || 'The assistant did not return any text.',
                    placeholder: false
                };
            }));
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
        } finally {
            setIsLoading(false);
        }
    }, [getSessionId, selectedProvider]);

    const handleReset = () => {
        setMessages(() => [...initialMessages]);
        setInputValue('');
        setIsLoading(false);
        sessionIdsRef.current = {};
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
        executeChat(trimmed);
    };

    return (
        <div className="panel-card bg-dark text-light d-flex flex-column chat-shell">
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
                        <span>{PROVIDERS.find(p => p.id === selectedProvider)?.label || PROVIDER_LABEL}</span>
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
                            {PROVIDERS.map(provider => (
                                <button
                                    key={provider.id}
                                    type="button"
                                    className={`dropdown-item${selectedProvider === provider.id ? ' active' : ''}`}
                                    disabled={provider.disabled || provider.id !== PROVIDER_ID}
                                    title={provider.disabled ? 'Disabled in this build' : undefined}
                                >
                                    {provider.label}
                                </button>
                            ))}
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
