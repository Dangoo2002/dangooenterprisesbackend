const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const multer = require('multer');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(bodyParser.json());
const port = process.env.PORT || 26689;


const db = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT,
});

db.connect((err) => {
  if (err) {
    console.error('Failed to connect to the database: ' + err.message);
  } else {
    console.log('Connected to the database');
  }
});




const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).array('images', 3); // Accept up to 3 images


const allowedOrigins = [
  'http://localhost:3000',
  'https://dangooenterprises.vercel.app', 
  'https://dangooenterprisesbackend.vercel.app' 
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true); // Allow request
    } else {
      callback(new Error('Not allowed by CORS')); // Deny request
    }
  },
  credentials: true, // Allow credentials such as cookies
  methods: 'GET,POST,PUT,DELETE',
  allowedHeaders: 'Content-Type,Authorization'
};

app.use(cors(corsOptions)); // Apply the CORS middleware


app.post('/signup', (req, res) => {
  const { email, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }

  const sql = 'INSERT INTO signup (email, password, confirmPassword) VALUES (?, ?, ?)';
  db.query(sql, [email, password, confirmPassword], (err, result) => {
    if (err) {
      console.error('Database error: ' + err.message);
      return res.status(500).json({ success: false, message: 'Registration failed' });
    } else {
      return res.json({ success: true, message: 'Registration successful' });
    }
  });
});

// Login route
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const sql = 'SELECT * FROM signup WHERE email = ? AND password = ?';
  db.query(sql, [email, password], (error, results) => {
    if (error) {
      res.status(500).send(error);
    } else if (results.length > 0) {
      const user = results[0];
      res.json({
        success: true,
        message: 'Login successful',
        user
      });
    } else {
      res.status(401).send('Invalid email or password');
    }
  });
});

// Cart add route
app.post('/cart/add', (req, res) => {
  const { user_id, item_id, quantity } = req.body;
  const sql = 'INSERT INTO cart (user_id, item_id, quantity) VALUES (?, ?, ?)';
  db.query(sql, [user_id, item_id, quantity], (error, result) => {
    if (error) {
      console.error('Database error: ' + error.message);
      res.status(500).json({ success: false, message: 'Failed to add item to cart' });
    } else {
      res.json({ success: true, message: 'Item added to cart' });
    }
  });
});

// Cart retrieval route
app.get('/cart/:userId', (req, res) => {
  const userId = req.params.userId;
  const sql = `
    SELECT c.cart_id, i.name, i.price, c.quantity 
    FROM cart c 
    JOIN items i ON c.item_id = i.item_id 
    WHERE c.user_id = ?
  `;
  db.query(sql, [userId], (error, results) => {
    if (error) {
      res.status(500).send(error);
    } else {
      res.json({ success: true, cart: results });
    }
  });
});

// Order placement route
app.post('/order/place', (req, res) => {
  const { user_id, items, total_price } = req.body;
  const insertOrder = 'INSERT INTO orders (user_id, total_price, payment_status) VALUES (?, ?, "pending")';

  db.query(insertOrder, [user_id, total_price], (error, result) => {
    if (error) {
      console.error('Order creation failed: ' + error.message);
      res.status(500).json({ success: false, message: 'Failed to create order' });
    } else {
      const orderId = result.insertId;
      const orderItems = items.map(item => [orderId, item.item_id, item.quantity, item.price_at_purchase]);

      const insertOrderItems = 'INSERT INTO order_items (order_id, item_id, quantity, price_at_purchase) VALUES ?';

      db.query(insertOrderItems, [orderItems], (error) => {
        if (error) {
          console.error('Failed to add order items: ' + error.message);
          res.status(500).json({ success: false, message: 'Failed to add order items' });
        } else {
          db.query('DELETE FROM cart WHERE user_id = ?', [user_id], (error) => {
            if (error) {
              res.status(500).json({ success: false, message: 'Failed to clear cart' });
            } else {
              res.json({ success: true, message: 'Order placed successfully' });
            }
          });
        }
      });
    }
  });
});

// Product API for file upload
app.post('/api/products', (req, res) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(500).json({ success: false, message: 'Multer error: ' + err.message });
    } else if (err) {
      return res.status(500).json({ success: false, message: 'Upload error: ' + err.message });
    }

    const { title, description, price } = req.body;
    const images = req.files;

    if (!images || images.length === 0) {
      return res.status(400).json({ success: false, message: 'No images uploaded' });
    }

    const productSql = 'INSERT INTO products (title, description, price) VALUES (?, ?, ?)';
    db.query(productSql, [title, description, price], (err, result) => {
      if (err) {
        console.error('Error adding product:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to add product' });
      }

      const productId = result.insertId;
      const imageSql = 'INSERT INTO product_images (product_id, image) VALUES ?';
      const imageValues = images.map((image) => {
        return [productId, image.buffer];
      });

      db.query(imageSql, [imageValues], (imageErr) => {
        if (imageErr) {
          console.error('Error inserting images:', imageErr.message);
          return res.status(500).json({ success: false, message: 'Failed to add product images' });
        }

        res.status(200).json({ success: true, message: 'Product and images added successfully!' });
      });
    });
  });
});

// Product retrieval route
app.get('/api/products', (req, res) => {
  const sql = `
    SELECT p.id, p.title, p.description, p.price, pi.image
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching products:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch products' });
    } else {
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
      res.json(products);
    }
  });
});

// Start the backend server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
