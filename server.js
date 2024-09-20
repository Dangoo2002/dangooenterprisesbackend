const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise'); 
const multer = require('multer');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(bodyParser.json());

const port = process.env.PORT || 26689;

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


async function checkDbConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("Connected to the MySQL database successfully!");
    connection.release();  
  } catch (error) {
    console.error("Failed to connect to the MySQL database:", error.message);
  }
}

checkDbConnection();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).array('images', 3);

const allowedOrigins = [
  'http://localhost:3000',
  'https://dangooenterprises.vercel.app',
  'https://dangooenterprisesbackend.vercel.app'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: 'GET,POST,PUT,DELETE',
  allowedHeaders: 'Content-Type,Authorization'
};

app.use(cors(corsOptions));


app.post('/signup', async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }

  try {

    const connection = await pool.getConnection();
    try {
      const sql = 'INSERT INTO signup (email, password) VALUES (?, ?)';
      await connection.query(sql, [email, password]);
      connection.release();
      return res.json({ success: true, message: 'Registration successful' });
    } catch (err) {
      connection.release();
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }
      console.error('Database error: ' + err.message);
      return res.status(500).json({ success: false, message: 'Registration failed' });
    }
  } catch (error) {
    console.error('Error: ' + error.message);
    return res.status(500).json({ success: false, message: 'Registration failed' });
  }
});


app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await pool.getConnection();
    const sql = 'SELECT * FROM signup WHERE email = ?';
    const [results] = await connection.query(sql, [email]);
    connection.release();

    if (results.length > 0) {
      const user = results[0];

      if (password === user.password) {
        return res.json({
          success: true,
          message: 'Login successful',
          user: { id: user.id, email: user.email }
        });
      } else {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
    } else {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
});


app.post('/loginadmin', async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await pool.getConnection();
    const sql = 'SELECT * FROM users WHERE email = ?';
    const [results] = await connection.query(sql, [email]);
    connection.release();

    if (results.length > 0) {
      const user = results[0];

    
      if (password === user.password) {
        return res.json({
          success: true,
          message: 'Login successful',
          user: { id: user.id, email: user.email }
        });
      } else {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
    } else {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Admin login error:', error.message);
    return res.status(500).json({ success: false, message: 'Admin login failed' });
  }
});


app.post('/cart/add', async (req, res) => {
  const { user_id, item_id, quantity } = req.body;

  try {
    const connection = await pool.getConnection();
    const sql = 'INSERT INTO cart (user_id, item_id, quantity) VALUES (?, ?, ?)';
    await connection.query(sql, [user_id, item_id, quantity]);
    connection.release();
    return res.json({ success: true, message: 'Item added to cart' });
  } catch (error) {
    console.error('Database error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add item to cart' });
  }
});


app.get('/cart/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const connection = await pool.getConnection();
    const sql = `
      SELECT c.cart_id, i.name, i.price, c.quantity 
      FROM cart c 
      JOIN items i ON c.item_id = i.item_id 
      WHERE c.user_id = ?
    `;
    const [results] = await connection.query(sql, [userId]);
    connection.release();

    return res.json({ success: true, cart: results });
  } catch (error) {
    console.error('Database error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve cart' });
  }
});


app.post('/order/place', async (req, res) => {
  const { user_id, items, total_price } = req.body;

  try {
    const connection = await pool.getConnection();
    const insertOrder = 'INSERT INTO orders (user_id, total_price, payment_status) VALUES (?, ?, "pending")';
    const [orderResult] = await connection.query(insertOrder, [user_id, total_price]);

    const orderId = orderResult.insertId;
    const orderItems = items.map(item => [orderId, item.item_id, item.quantity, item.price_at_purchase]);

    const insertOrderItems = 'INSERT INTO order_items (order_id, item_id, quantity, price_at_purchase) VALUES ?';
    await connection.query(insertOrderItems, [orderItems]);

    await connection.query('DELETE FROM cart WHERE user_id = ?', [user_id]);

    connection.release();
    return res.json({ success: true, message: 'Order placed successfully' });
  } catch (error) {
    console.error('Order error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to place order' });
  }
});


app.get('/api/category/:category', async (req, res) => {
  const { category } = req.params;

  const categoryMap = {
    'phones-laptops': 1,
    'wifi-routers': 2,
    'beds': 3,
    'sofa-couches': 4,
    'woofers-tv': 5,
    'tables': 6,
    'kitchen-utensils': 7,
  };

  const categoryId = categoryMap[category];
  if (!categoryId) {
    return res.status(400).json({ success: false, message: 'Invalid category' });
  }

  try {
    const connection = await pool.getConnection();
    const sql = `
      SELECT p.id, p.title, p.description, p.price, pi.image
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id
      WHERE p.category_id = ?
    `;
    const [results] = await connection.query(sql, [categoryId]);

    const productsMap = {};
    results.forEach(row => {
      if (!productsMap[row.id]) {
        productsMap[row.id] = {
          id: row.id,
          title: row.title,
          description: row.description,
          price: row.price,
          images: []
        };
      }
      if (row.image) {
        productsMap[row.id].images.push(`data:image/jpeg;base64,${row.image.toString('base64')}`);
      }
    });

    const products = Object.values(productsMap);
    connection.release();
    return res.json(products);
  } catch (error) {
    console.error('Product fetch error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});


app.post('/api/products', upload, async (req, res) => {
  const { title, description, price, category, isNew } = req.body;
  const images = req.files;


  const categoryMap = {
    'phones_laptops': 1,
    'wifi_routers': 2,
    'beds': 3,
    'sofa_couches': 4,
    'woofers_tv': 5,
    'tables': 6,
    'kitchen_utensils': 7
  };

  const categoryId = categoryMap[category];


  if (!categoryId) {
    return res.status(400).json({ success: false, message: 'Invalid category' });
  }

  try {
    const connection = await pool.getConnection();


    const insertProductQuery = `INSERT INTO products (title, description, price, is_new, category_id) VALUES (?, ?, ?, ?, ?)`;
    const [productResult] = await connection.query(insertProductQuery, [title, description, price, isNew, categoryId]);
    const productId = productResult.insertId; 
    if (images && images.length > 0) {
      const insertImageQuery = `INSERT INTO product_images (product_id, image) VALUES (?, ?)`;

      for (let image of images) {
        await connection.query(insertImageQuery, [productId, image.buffer]); 
      }
    }

    connection.release();
    return res.json({ success: true, message: 'Product added successfully!' });
  } catch (error) {
    console.error('Database error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add product' });
  }
});



app.get('/api/products', async (req, res) => {
  const categoryId = req.query.categoryId;  
  let sql = `
    SELECT p.id, p.title, p.description, p.price, p.is_new, pi.image, c.name as category_name
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id
    LEFT JOIN categories c ON p.category_id = c.id
  `;

  const queryParams = [];

  if (categoryId) {
    sql += ` WHERE p.category_id = ?`;
    queryParams.push(categoryId);
  }

  try {
    const connection = await pool.getConnection();
    const [results] = await connection.query(sql, queryParams);

    const productsMap = {};
    results.forEach(row => {
      if (!productsMap[row.id]) {
        productsMap[row.id] = {
          id: row.id,
          title: row.title,
          description: row.description,
          price: row.price,
          is_new: row.is_new,  
          category: row.category_name, 
          images: []
        };
      }
      if (row.image) {
        productsMap[row.id].images.push(`data:image/jpeg;base64,${row.image.toString('base64')}`);
      }
    });

    const products = Object.values(productsMap);
    connection.release();
    return res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});




app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
