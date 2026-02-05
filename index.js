const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 环境变量
const {
  OPENAI_API_KEY,
  CHATWOOT_API_TOKEN,
  CHATWOOT_BASE_URL,
  CHATWOOT_ACCOUNT_ID
} = process.env;

// 验证环境变量
if (!OPENAI_API_KEY || !CHATWOOT_API_TOKEN || !CHATWOOT_BASE_URL) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// 健康检查端点
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'Chatwoot AI Assistant',
    message: 'Use POST /chatwoot-webhook for webhook integration'
  });
});

// Chatwoot webhook处理端点
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    console.log('Received webhook:', JSON.stringify(req.body, null, 2));
    
    const event = req.body;
    
    // 验证请求结构
    if (!event || !event.event) {
      console.log('Invalid webhook structure:', event);
      return res.status(400).json({ 
        status: 'error', 
        error: 'Invalid webhook structure' 
      });
    }
    
    // 验证是消息事件
    if (event.event !== 'message_created' && event.event !== 'message_updated') {
      console.log('Ignoring non-message event:', event.event);
      return res.status(200).json({ 
        status: 'ignored', 
        reason: 'Not a message event' 
      });
    }

    // Chatwoot直接发送消息对象，而不是嵌套在message字段中
    const message = event;
    
    // 只处理用户发送的消息，忽略AI发送的消息
    if (message.message_type !== 'incoming') {
      console.log('Ignoring non-incoming message:', message.message_type);
      return res.status(200).json({ 
        status: 'ignored', 
        reason: 'Not an incoming message' 
      });
    }

    // 获取对话上下文
    const conversationId = message.conversation?.id || message.conversation_id;
    const content = message.content || '';
    
    // 清理HTML标签（Chatwoot发送的内容包含HTML）
    const cleanContent = content.replace(/<[^>]*>/g, '').trim();
    
    if (!cleanContent) {
      console.log('Empty message content after cleaning');
      return res.status(200).json({ 
        status: 'ignored', 
        reason: 'Empty message' 
      });
    }
    
    console.log('Processing message:', {
      conversationId,
      content: cleanContent.substring(0, 100) + '...',
      sender: message.sender?.id
    });

    // 调用OpenAI生成回复
    const aiResponse = await generateAIResponse(cleanContent, conversationId);
    
    console.log('AI Response generated:', aiResponse.substring(0, 100) + '...');
    
    // 发送回复到Chatwoot
    await sendMessageToChatwoot(conversationId, aiResponse);
    
    res.json({ 
      status: 'success', 
      message: 'AI response sent',
      response_preview: aiResponse.substring(0, 100) + '...'
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// OpenAI生成回复函数
async function generateAIResponse(userMessage, conversationId) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful customer support assistant for an e-commerce store called CyberHome. Be friendly, professional, and helpful. Answer questions about products, orders, shipping, and returns. Keep responses concise and helpful.'
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content.trim();
    
  } catch (error) {
    console.error('OpenAI API error:', error.response?.data || error.message);
    return 'I apologize, but I encountered an error processing your request. Please try again or contact support for assistance.';
  }
}

// 发送消息到Chatwoot
async function sendMessageToChatwoot(conversationId, content) {
  try {
    console.log('Sending message to Chatwoot:', {
      baseUrl: CHATWOOT_BASE_URL,
      accountId: CHATWOOT_ACCOUNT_ID,
      conversationId: conversationId
    });

    const url = `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`;
    console.log('API URL:', url);

    const response = await axios.post(
      url,
      {
        content: content,
        message_type: 'outgoing',
        private: false
      },
      {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Message sent to Chatwoot successfully:', response.data);
    return response.data;

  } catch (error) {
    console.error('Chatwoot API error details:');
    console.error('URL:', error.config?.url);
    console.error('Method:', error.config?.method);
    console.error('Status:', error.response?.status);
    console.error('Status Text:', error.response?.statusText);
    console.error('Response Data:', error.response?.data);
    console.error('Full Error:', error.message);
    
    throw error;
  }
}

// 启动服务器
app.listen(port, '0.0.0.0', () => {
  console.log(`AI Assistant server running on port ${port}`);
  console.log(`Webhook endpoint: http://0.0.0.0:${port}/chatwoot-webhook`);
  console.log('Environment variables loaded:');
  console.log('- CHATWOOT_BASE_URL:', CHATWOOT_BASE_URL ? 'Set' : 'Missing');
  console.log('- CHATWOOT_ACCOUNT_ID:', CHATWOOT_ACCOUNT_ID ? 'Set' : 'Missing');
  console.log('- CHATWOOT_API_TOKEN:', CHATWOOT_API_TOKEN ? 'Set' : 'Missing');
  console.log('- OPENAI_API_KEY:', OPENAI_API_KEY ? 'Set' : 'Missing');
});