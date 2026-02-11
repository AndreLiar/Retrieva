---
sidebar_position: 2
---

# Authentication

JWT-based authentication with secure token management.

## Token Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Token Lifecycle                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Login/Register                                                         │
│        │                                                                 │
│        ▼                                                                 │
│   ┌──────────────┐     ┌──────────────┐                                 │
│   │ Access Token │     │Refresh Token │                                 │
│   │   (15 min)   │     │   (7 days)   │                                 │
│   └──────┬───────┘     └──────┬───────┘                                 │
│          │                    │                                          │
│          │                    │  Stored hashed                           │
│          ▼                    ▼  in database                             │
│   ┌──────────────┐     ┌──────────────┐                                 │
│   │HttpOnly Cookie│    │HttpOnly Cookie│                                │
│   └──────────────┘     └──────────────┘                                 │
│                                                                          │
│   On Access Token Expiry:                                                │
│        │                                                                 │
│        ▼                                                                 │
│   POST /auth/refresh                                                     │
│        │                                                                 │
│        ▼                                                                 │
│   New Access Token                                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## JWT Configuration

### Access Token

```javascript
const accessToken = jwt.sign(
  {
    userId: user._id,
    email: user.email,
    role: user.role,
  },
  process.env.JWT_SECRET,
  {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    algorithm: 'HS256',
  }
);
```

### Refresh Token

```javascript
const refreshToken = jwt.sign(
  {
    userId: user._id,
    tokenVersion: user.tokenVersion,  // For invalidation
  },
  process.env.JWT_REFRESH_SECRET,
  {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    algorithm: 'HS256',
  }
);

// Store hash in database
user.refreshToken = await bcrypt.hash(refreshToken, 10);
await user.save();
```

## Cookie Configuration

```javascript
const cookieConfig = {
  httpOnly: true,                    // Prevent XSS access
  secure: process.env.NODE_ENV === 'production',  // HTTPS only in prod
  sameSite: 'strict',                // CSRF protection
  path: '/',
  domain: process.env.COOKIE_DOMAIN || undefined,
};

// Access token cookie
res.cookie('accessToken', accessToken, {
  ...cookieConfig,
  maxAge: 15 * 60 * 1000,  // 15 minutes
});

// Refresh token cookie
res.cookie('refreshToken', refreshToken, {
  ...cookieConfig,
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
});
```

## Password Security

### Hashing

```javascript
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 12;

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

// Compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};
```

### Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

```javascript
const passwordSchema = Joi.string()
  .min(8)
  .pattern(/[A-Z]/, 'uppercase')
  .pattern(/[a-z]/, 'lowercase')
  .pattern(/[0-9]/, 'number')
  .pattern(/[^A-Za-z0-9]/, 'special')
  .required();
```

## Token Validation

```javascript
export const authenticate = async (req, res, next) => {
  // Get token from cookie or header
  const token = req.cookies.accessToken ||
                req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new AppError('Authentication required', 401);
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Load user
    const user = await User.findById(decoded.userId);

    if (!user) {
      throw new AppError('User not found', 401);
    }

    if (user.status !== 'active') {
      throw new AppError('Account is not active', 403);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Token expired', 401);
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AppError('Invalid token', 401);
    }
    throw error;
  }
};
```

## Token Refresh Flow

```javascript
export const refreshToken = async (req, res) => {
  const token = req.cookies.refreshToken;

  if (!token) {
    throw new AppError('Refresh token required', 401);
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    // Find user with stored refresh token
    const user = await User.findById(decoded.userId).select('+refreshToken');

    if (!user || !user.refreshToken) {
      throw new AppError('Invalid refresh token', 401);
    }

    // Verify stored token matches
    const isValid = await bcrypt.compare(token, user.refreshToken);
    if (!isValid) {
      throw new AppError('Invalid refresh token', 401);
    }

    // Generate new access token
    const accessToken = generateAccessToken(user);

    // Set new cookie
    res.cookie('accessToken', accessToken, accessTokenCookieConfig);

    sendSuccess(res, { message: 'Token refreshed' });
  } catch (error) {
    // Clear cookies on refresh failure
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    throw new AppError('Session expired, please login again', 401);
  }
};
```

## Token Invalidation

### Logout (Single Session)

```javascript
export const logout = async (req, res) => {
  // Clear cookies
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  // Invalidate refresh token in database
  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, {
      refreshToken: null,
    });
  }

  sendSuccess(res, { message: 'Logged out successfully' });
};
```

### Logout All Sessions

```javascript
export const logoutAll = async (req, res) => {
  // Increment token version to invalidate all refresh tokens
  await User.findByIdAndUpdate(req.user._id, {
    $inc: { tokenVersion: 1 },
    refreshToken: null,
  });

  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  sendSuccess(res, { message: 'Logged out from all devices' });
};
```

## Brute Force Protection

```javascript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 attempts
  message: 'Too many login attempts, please try again later',
  handler: (req, res) => {
    logger.warn('Login rate limit exceeded', {
      ip: req.ip,
      email: req.body.email,
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many login attempts, please try again later',
    });
  },
});

router.post('/login', loginLimiter, authController.login);
```

## Security Best Practices

1. **Never log tokens** - Avoid logging access or refresh tokens
2. **Short access tokens** - 15 minutes limits exposure window
3. **Secure storage** - HttpOnly cookies prevent XSS theft
4. **Hash refresh tokens** - Stored hashed in database
5. **Version tokens** - Allow invalidation of all sessions
6. **Rate limit auth** - Prevent brute force attacks
