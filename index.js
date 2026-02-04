// 引入依赖模块
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// 设置一个简单的路由
app.get('/', (req, res) => {
  res.send('Hello, world!');
});

// 启动服务器
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
