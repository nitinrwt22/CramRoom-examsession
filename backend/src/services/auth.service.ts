import { getUserByEmail, createUser } from '../db/helpers';
import { hashPassword } from '../utils/password';

export const registerUser = async (name: string, email: string, password: string) => {
    // 1. Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
        throw new Error('User with this email already exists');
    }

    // 2. Hash the password
    const hashedPassword = await hashPassword(password);

    // 3. Create the user
    const newUser = await createUser(name, email, hashedPassword);

    // 4. Return user info without password
    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
};

import jwt from 'jsonwebtoken';
import { comparePassword } from '../utils/password';
import { config } from '../config/env';

export const loginUser = async (email: string, password: string) => {
    // 1. Find user by email
    const user = await getUserByEmail(email);
    if (!user) {
        throw new Error('Invalid email or password');
    }

    // 2. Compare password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
        throw new Error('Invalid email or password');
    }

    // 3. Generate JWT token
    const token = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.secret || 'default_secret',
        { expiresIn: '1d' }
    );

    return { token, user: { id: user.id, name: user.name, email: user.email } };
};

