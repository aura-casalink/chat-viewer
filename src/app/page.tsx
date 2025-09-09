'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// Configuración de Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TABLE_NAME = 'chat_sessions';

// IPs a excluir
const EXCLUDED_IPS = [
  '2.138.132.39',
  '2.138.102.219',
  '80.103.58.188',
  '79.153.26.117',
  '83.56.222.120'
];

// Tipo para las conversaciones
interface Conversation {
  id: number | string;
  session_id?: string;
  device_id?: string;
  topic?: string;
  conversation_title?: string;
  ip?: string;
  created_at: string;
  updated_at?: string;
  hide?: boolean;
  conversations?: any;
  property_sets_json?: string;
  favorited_properties_json?: string;
  browser_info_json?: string;
  last_properties_json?: string;
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('⚠️ Falta configurar las variables de entorno en .env.local');
}

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export default function ConversationViewer() {
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showFilters, setShowFilters] = useState(true);

  // Usar useCallback para evitar recrear la función en cada render
  const loadAllConversations = useCallback(async () => {
    try {
      setLoadingList(true);
      
      console.log('Cargando conversaciones...');
      
      const { data, error } = await supabase!
        .from(TABLE_NAME)
        .select('*')
        .not('conversations', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error de Supabase:', error);
        throw error;
      }

      if (data && data.length > 0) {
        console.log('Columnas disponibles:', Object.keys(data[0]));
        
        // Filtrar las IPs excluidas y conversaciones vacías
        const filteredData = data.filter((conv: Conversation) => 
          !EXCLUDED_IPS.includes(conv.ip || '') && 
          conv.conversations !== null &&
          conv.conversations !== undefined
        );
        
        console.log(`Conversaciones totales: ${data.length}, después de filtros: ${filteredData.length}`);
        
        setAllConversations(filteredData);
        setFilteredConversations(filteredData);
        
        // Cargar la primera conversación automáticamente
        if (filteredData.length > 0) {
          setSelectedId(filteredData[0].id.toString());
          loadConversation(filteredData[0].id);
        }
      } else {
        console.log('No se encontraron conversaciones');
        setAllConversations([]);
        setFilteredConversations([]);
      }
    } catch (err: any) {
      console.error('Error detallado:', err);
      setError(`Error al cargar lista: ${err.message || 'Error desconocido'}`);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    // Cargar fuente Poppins
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    
    if (supabase) {
      loadAllConversations();
    } else {
      setError('Error: Configura las variables de entorno en .env.local');
    }
  }, [loadAllConversations]);

  useEffect(() => {
    // Aplicar todos los filtros
    let filtered = [...allConversations];

    // Filtro de texto
    if (searchFilter) {
      filtered = filtered.filter(conv => 
        conv.id.toString().includes(searchFilter) ||
        (conv.conversation_title && conv.conversation_title.toLowerCase().includes(searchFilter.toLowerCase())) ||
        (conv.topic && conv.topic.toLowerCase().includes(searchFilter.toLowerCase()))
      );
    }

    // Filtro de fecha desde
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filtered = filtered.filter(conv => {
        const convDate = new Date(conv.created_at);
        return convDate >= fromDate;
      });
    }

    // Filtro de fecha hasta
    if (dateTo) {
      const toDate = new Date(dateTo + 'T23:59:59');
      filtered = filtered.filter(conv => {
        const convDate = new Date(conv.created_at);
        return convDate <= toDate;
      });
    }

    setFilteredConversations(filtered);
  }, [searchFilter, dateFrom, dateTo, allConversations]);

  const normalizeMessages = (conversations: any) => {
    // Si es un string, intentar parsearlo
    if (typeof conversations === 'string') {
      try {
        conversations = JSON.parse(conversations);
      } catch (e) {
        console.error('Error parseando string:', e);
        return [];
      }
    }

    // Si no es un array, convertirlo
    if (!Array.isArray(conversations)) {
      if (conversations && typeof conversations === 'object') {
        conversations = [conversations];
      } else {
        return [];
      }
    }

    // Normalizar el formato de cada mensaje
    return conversations.map((msg: any) => {
      // Determinar si es usuario o asistente
      let isUser = false;
      if (msg.sender === 'user' || msg.type === 'user') {
        isUser = true;
      } else if (msg.sender === 'bot' || msg.sender === 'assistant' || 
                 msg.type === 'assistant' || msg.sender === 'luci') {
        isUser = false;
      }

      // Obtener el contenido del mensaje
      const content = msg.text || msg.content || msg.message || '';

      // Obtener timestamp si existe
      const timestamp = msg.timestamp || null;

      return {
        isUser,
        content,
        timestamp,
        original: msg
      };
    }).filter((msg: any) => msg.content && msg.content !== 'SUCCESS');
  };

  const loadConversation = async (id: number | string) => {
    if (!id || !supabase) return;

    try {
      setLoading(true);
      setError('');
      
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('conversations')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data && data.conversations !== null && data.conversations !== undefined) {
        const normalizedMessages = normalizeMessages(data.conversations);
        setMessages(normalizedMessages);
        
        if (normalizedMessages.length === 0) {
          setError('Esta conversación está vacía');
        }
      } else {
        setMessages([]);
        setError('No se encontraron conversaciones');
      }
    } catch (err: any) {
      console.error('Error:', err);
      setError(`Error: ${err.message || 'Error al cargar la conversación'}`);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConversation = (id: number | string) => {
    setSelectedId(id.toString());
    loadConversation(id);
  };

  const clearFilters = () => {
    setSearchFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', { 
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return '';
    }
  };

  // Contar mensajes de la conversación
  const getMessageCount = (conv: Conversation) => {
    try {
      if (conv.conversations) {
        const msgs = normalizeMessages(conv.conversations);
        return msgs.length;
      }
    } catch {
      return 0;
    }
    return 0;
  };

  // Obtener fechas mínima y máxima para los inputs
  const getDateRange = () => {
    if (allConversations.length === 0) return { min: '', max: '' };
    
    const dates = allConversations.map(c => new Date(c.created_at));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    return {
      min: minDate.toISOString().split('T')[0],
      max: maxDate.toISOString().split('T')[0]
    };
  };

  const dateRange = getDateRange();

  return (
    <div className="h-screen flex bg-gray-50" style={{ fontFamily: 'Poppins, sans-serif' }}>
      {/* Sidebar con lista de conversaciones */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-white border-r border-gray-200 flex flex-col overflow-hidden`}>
        {/* Header del sidebar */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-lg" style={{ color: '#0A0A23' }}>
              Conversaciones
            </h2>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              title={showFilters ? "Ocultar filtros" : "Mostrar filtros"}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
          </div>

          {/* Filtros */}
          {showFilters && (
            <div className="space-y-3">
              {/* Filtro de texto */}
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Buscar por ID/Título/Tema</label>
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-sm"
                  placeholder="Filtrar..."
                  style={{ borderColor: '#FFB300' }}
                />
              </div>

              {/* Filtros de fecha */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Desde</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    min={dateRange.min}
                    max={dateRange.max}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Hasta</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    min={dateRange.min}
                    max={dateRange.max}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-xs"
                  />
                </div>
              </div>

              {/* Botón limpiar filtros */}
              {(searchFilter || dateFrom || dateTo) && (
                <button
                  onClick={clearFilters}
                  className="w-full px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          <div className="text-xs text-gray-500 mt-3 flex justify-between">
            <span>{filteredConversations.length} de {allConversations.length}</span>
            <span>Sin IPs excluidas ni nulls</span>
          </div>
        </div>

        {/* Lista de conversaciones */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#FFB300' }}></div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {(searchFilter || dateFrom || dateTo) ? 'No se encontraron conversaciones con estos filtros' : 'No hay conversaciones disponibles'}
            </div>
          ) : (
            <div className="p-2">
              {filteredConversations.map((conv) => {
                const messageCount = getMessageCount(conv);
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`w-full text-left p-3 mb-2 rounded-lg transition-all hover:shadow-md ${
                      selectedId === conv.id.toString() 
                        ? 'shadow-md' 
                        : 'hover:bg-gray-50'
                    }`}
                    style={{
                      backgroundColor: selectedId === conv.id.toString() ? '#FFF4E0' : '',
                      borderLeft: selectedId === conv.id.toString() ? '3px solid #FFB300' : '3px solid transparent'
                    }}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm" style={{ color: '#0A0A23' }}>
                        ID: {conv.id}
                      </span>
                      {messageCount > 0 && (
                        <span className="text-xs text-gray-500">
                          {messageCount} msgs
                        </span>
                      )}
                    </div>
                    {conv.conversation_title && (
                      <div className="text-sm text-gray-700 mb-1 truncate">
                        {conv.conversation_title}
                      </div>
                    )}
                    {conv.topic && (
                      <div className="text-xs text-gray-500 truncate">
                        {conv.topic}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {formatDate(conv.created_at)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Botón para mostrar/ocultar sidebar */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10 p-2 bg-white border border-gray-200 rounded-r-md shadow-md hover:shadow-lg transition-all"
        style={{ 
          left: sidebarOpen ? '320px' : '0px',
          transition: 'left 0.3s'
        }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d={sidebarOpen ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
        </svg>
      </button>

      {/* Área principal del chat */}
      <div className="flex-1 flex flex-col">
        {/* Header con ID seleccionado */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium" style={{ color: '#0A0A23' }}>
                  Conversación:
                </span>
                <span className="px-3 py-1 rounded-md font-semibold" 
                      style={{ backgroundColor: '#FFF4E0', color: '#0A0A23' }}>
                  {selectedId || 'Ninguna seleccionada'}
                </span>
                {messages.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {messages.length} mensajes
                  </span>
                )}
              </div>
              <button
                onClick={loadAllConversations}
                className="px-4 py-2 text-white rounded-md hover:opacity-90 transition-opacity font-medium"
                style={{ backgroundColor: '#FFB300' }}
              >
                Recargar lista
              </button>
            </div>
          </div>
        </div>

        {/* Área de mensajes */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full px-4 py-6">
            <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {!selectedId ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-gray-500">Selecciona una conversación de la lista</p>
                </div>
              ) : loading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2" 
                       style={{ borderColor: '#FFB300' }}></div>
                </div>
              ) : error && messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-red-600 text-center">
                    <svg className="mx-auto h-12 w-12 text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-semibold mb-2">Error</p>
                    <p className="text-sm max-w-md">{error}</p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-gray-500">No hay mensajes para mostrar</p>
                </div>
              ) : (
                <div className="h-full overflow-y-auto p-6">
                  <div className="space-y-4">
                    {messages.map((msg: any, index: number) => {
                      const alignClass = msg.isUser ? 'justify-end' : 'justify-start';
                      const bubbleStyle = msg.isUser 
                        ? { backgroundColor: '#FFB300', color: 'white' }
                        : { backgroundColor: '#D8D8E0', color: '#0A0A23' };
                      const labelStyle = msg.isUser 
                        ? { color: 'rgba(255,255,255,0.9)' }
                        : { color: '#666' };
                      
                      return (
                        <div key={index} className={`flex ${alignClass}`}>
                          <div className={`max-w-[70%] px-4 py-3 rounded-lg ${msg.isUser ? 'ml-auto' : ''}`}
                               style={bubbleStyle}>
                            <div className="text-xs mb-1 flex justify-between items-center"
                                 style={labelStyle}>
                              <span className="font-medium">{msg.isUser ? 'Usuario' : 'Luci'}</span>
                              {msg.timestamp && (
                                <span className="ml-2 opacity-70">
                                  {formatTimestamp(msg.timestamp)}
                                </span>
                              )}
                            </div>
                            <div className="text-sm whitespace-pre-wrap break-words">
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
