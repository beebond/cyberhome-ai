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
    
    // 验证是消息事件
    if (event.event !== 'message_created' && event.event !== 'message_updated') {
      return res.status(200).json({ status: 'ignored', reason: 'Not a message event' });
    }

    const message = event.message;
    
    // 只处理用户发送的消息，忽略AI发送的消息
    if (message.message_type !== 'incoming') {
      return res.status(200).json({ status: 'ignored', reason: 'Not an incoming message' });
    }

    // 获取对话上下文
    const conversationId = message.conversation_id;
    const contactId = message.sender.id;
    
    // 调用OpenAI生成回复
    const aiResponse = await generateAIResponse(message.content, conversationId);
    
    // 发送回复到Chatwoot
    await sendMessageToChatwoot(conversationId, aiResponse);
    
    res.json({ status: 'success', message: 'AI response sent' });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message 
    });
  }
});

// 备用webhook端点（兼容Chatwoot默认配置）
app.post('/', async (req, res) => {
  console.log('Received webhook at root endpoint');
  // 重定向到chatwoot-webhook处理
  req.url = '/chatwoot-webhook';
  app.handle(req, res);
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
            content: 'You are a helpful customer support assistant for an e-commerce store. Be friendly, professional, and helpful. Answer questions about products, orders, shipping, and returns.'
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
    const response = await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
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
    
    console.log('Message sent to Chatwoot:', response.data);
    return response.data;
    
  } catch (error) {
    console.error('Chatwoot API error:', error.response?.data || error.message);
    throw error;
  }
}

// 启动服务器
app.listen(port, '0.0.0.0', () => {
  console.log(`AI Assistant server running on port ${port}`);
  console.log(`Webhook endpoint: http://0.0.0.0:${port}/chatwoot-webhook`);
});