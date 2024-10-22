const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise'); 
const multer = require('multer');
require('dotenv').config();
const bcrypt = require('bcrypt');

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
  connectionLimit: 60,
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
const upload = multer({ storage: storage });


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

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const sql = 'INSERT INTO signup (email, password) VALUES (?, ?)';
      await connection.query(sql, [email, hashedPassword]);
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

     
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (passwordMatch) {
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

  console.log('Incoming request to add to cart:', { user_id, item_id, quantity });

  if (!user_id || !item_id || !quantity) {
    console.error('Missing required fields:', { user_id, item_id, quantity });
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    const connection = await pool.getConnection();
    
    // Fetch product details and image from the product_images table
    const [productResults] = await connection.query(`
      SELECT p.title, p.description, p.price, pi.image 
      FROM products p 
      LEFT JOIN product_images pi ON p.id = pi.product_id 
      WHERE p.id = ?
    `, [item_id]);

    console.log('Product results:', productResults);

    if (productResults.length === 0) {
      connection.release();
      console.error('Product not found for item_id:', item_id);
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = productResults[0];

    // If the image is null, log the product info for debugging
    if (!product.image) {
      console.error('No image found for product:', product);
    }

    const sql = `
      INSERT INTO cart (user_id, item_id, title, description, price, quantity, image)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + ?;
    `;

    console.log('Executing SQL:', sql);
    console.log('With parameters:', [
      user_id,
      item_id,
      product.title,
      product.description,
      product.price,
      quantity,
      product.image || null,  // Image from product_images or null if not found
      quantity
    ]);

    // Insert item into the cart, including the image
    await connection.query(sql, [
      user_id,
      item_id,
      product.title,
      product.description,
      product.price,
      quantity,
      product.image || null,  // Insert image or leave it null
      quantity 
    ]);

    connection.release();
    console.log('Item added to cart successfully:', { user_id, item_id });
    return res.json({ success: true, message: 'Item added to cart' });
  } catch (error) {
    console.error('Database error occurred:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add item to cart' });
  }
});




app.get('/cart/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const connection = await pool.getConnection();
    
   
    const sql = `
      SELECT c.id, c.title, c.description, c.price, c.quantity, pi.image
      FROM cart c
      LEFT JOIN product_images pi ON c.item_id = pi.product_id
      WHERE c.user_id = ?
    `;

    const [results] = await connection.query(sql, [userId]);
    connection.release();

    return res.json({ success: true, cart: results });
  } catch (error) {
    console.error('Database error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch cart items' });
  }
});


app.delete('/cart/:user_id/:item_id', async (req, res) => {
  const { user_id, item_id } = req.params;

  console.log('Deleting item from cart:', { user_id, item_id });

  if (!user_id || !item_id) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    const connection = await pool.getConnection();

    const result = await connection.query(`
      DELETE FROM cart WHERE user_id = ? AND item_id = ?`, 
      [user_id, item_id]);

    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    console.log('Item deleted successfully:', { user_id, item_id });
    return res.json({ success: true, message: 'Item removed from cart' });
  } catch (error) {
    console.error('Database error occurred:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to remove item from cart' });
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





app.post('/api/products', upload.array('images', 10), async (req, res) => {
  const { title, description, price, category, isNew } = req.body;
  const images = req.files;

  // Map category to a table name for the category-specific table
  const categoryTableMap = {
    'phones_laptops': 'phones_laptops',
    'wifi_routers': 'wifi_routers',
    'beds': 'beds',
    'sofa_couches': 'sofa_couches',
    'woofers_tv': 'woofers_tv',
    'tables': 'tables',
    'kitchen_utensils': 'kitchen_utensils'
  };

  const categoryTableName = categoryTableMap[category];

  // Ensure the category exists and the table name is valid
  if (!categoryTableName) {
    return res.status(400).json({ success: false, message: 'Invalid category' });
  }

  try {
    const connection = await pool.getConnection();

    // Insert the product into the centralized 'products' table
    const insertProductQuery = `INSERT INTO products (title, description, price, is_new, category_id) VALUES (?, ?, ?, ?, ?)`;
    const categoryId = Object.values(categoryTableMap).indexOf(categoryTableName) + 1;
    const [productResult] = await connection.query(insertProductQuery, [title, description, price, isNew, categoryId]);
    const productId = productResult.insertId;

    // Insert the product into the category-specific table (like 'phones_laptops')
    const insertCategoryProductQuery = `INSERT INTO ${categoryTableName} (id, title, description, price, is_new, category_id) VALUES (?, ?, ?, ?, ?, ?)`;
    await connection.query(insertCategoryProductQuery, [productId, title, description, price, isNew, categoryId]);

    // Insert images into both the 'product_images' table and the category-specific table
    if (images && images.length > 0) {
      const insertImageQuery = `INSERT INTO product_images (product_id, image) VALUES (?, ?)`;
      const insertCategoryImageQuery = `UPDATE ${categoryTableName} SET image = ? WHERE id = ?`;

      for (let image of images) {
        await connection.query(insertImageQuery, [productId, image.buffer]); // Insert image into 'product_images'
        await connection.query(insertCategoryImageQuery, [image.buffer, productId]); // Insert image into category-specific table
      }
    }

    connection.release();
    return res.json({ success: true, message: 'Product and images added successfully!' });
  } catch (error) {
    console.error('Database error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add product' });
  }
});





app.get('/api/products', async (req, res) => {
  const { search } = req.query;

  let sql = `
    SELECT p.id, p.title, p.description, p.price, pi.image, p.category, c.name as category_name
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id
    LEFT JOIN categories c ON p.category = c.id
  `;

  const queryParams = [];

  if (search) {
    sql += ` WHERE p.title LIKE ? OR p.description LIKE ?`;
    queryParams.push(`%${search}%`, `%${search}%`);
  }

  try {
    const connection = await pool.getConnection();
    const [results] = await connection.query(sql, queryParams);
    
    const products = results.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      category: row.category, // Include category in the response
      image: row.image ? `data:image/jpeg;base64,${row.image.toString('base64')}` : null
    }));

    connection.release();
    return res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});


app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await pool.getConnection();
    const sql = `SELECT * FROM products WHERE id = ?`;
    const [product] = await connection.query(sql, [id]);
    connection.release();

    if (product.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product[0]); // Return the product details
  } catch (error) {
    console.error('Error fetching product:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});







app.get('/phones_laptops', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM phones_laptops`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});


app.get('/api/:table/:id', async (req, res) => {
  const { table, id } = req.params;

  try {
    const connection = await pool.getConnection();
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM ?? WHERE id = ?`;
    const [results] = await connection.query(sql, [table, id]);
    connection.release();

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = results[0];
    
    const productWithImage = {
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new,
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null,
    };

    return res.json({ success: true, product: productWithImage }); // Ensure success flag is included
  } catch (error) {
    console.error(`Error fetching product from table ${table}:`, error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});





app.get('/wifi_routers', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM wifi_routers`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

app.get('/beds', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM beds`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});


app.get('/sofa_couches', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM sofa_couches`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});


app.get('/woofers_tv', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM woofers_tv`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

app.get('/tables', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM tables`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

app.get('/kitchen_utensils', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM kitchen_utensils`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
