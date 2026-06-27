import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Google from 'expo-auth-session/providers/google';
import { authApi, userApi, adminApi } from '../../../services';
import { Input } from '../../../components/Input';
import { Button } from '../../../components/Button';
import { COLORS } from '../../../constants/colors';

interface Props {
  onLoginSuccess: (role: 'USER' | 'ADMIN') => void;
  onNavigateRegister: () => void;
  onNavigateForgot: () => void;
}

export const LoginForm = ({ onLoginSuccess, onNavigateRegister, onNavigateForgot }: Props) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Configure Google Auth (Provide real Web Client ID via env vars in production)
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com',
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { idToken } = response.authentication || {};
      if (idToken) {
        handleGoogleLoginApi(idToken);
      }
    } else if (response?.type === 'error') {
      Alert.alert('Google Login Error', response.error?.message || 'Authentication failed');
    }
  }, [response]);

  const handleGoogleLoginApi = async (idToken: string) => {
    setIsLoading(true);
    try {
      const apiResponse = await authApi.googleLogin({ idToken });
      await AsyncStorage.setItem('token', apiResponse.data.result.token);
      
      try {
        await userApi.getMe();
        await AsyncStorage.setItem('role', 'USER');
        onLoginSuccess('USER');
      } catch {
        try {
          await adminApi.getMe();
          await AsyncStorage.setItem('role', 'ADMIN');
          onLoginSuccess('ADMIN');
        } catch {
          Alert.alert('Error', 'Could not fetch profile.');
        }
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      Alert.alert('Google Login Failed', err.response?.data?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter username and password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.login({ username, password });
      await AsyncStorage.setItem('token', response.data.result.token);

      try {
        await userApi.getMe();
        await AsyncStorage.setItem('role', 'USER');
        onLoginSuccess('USER');
      } catch {
        try {
          await adminApi.getMe();
          await AsyncStorage.setItem('role', 'ADMIN');
          onLoginSuccess('ADMIN');
        } catch {
          Alert.alert('Error', 'Could not fetch profile.');
        }
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      Alert.alert('Login Failed', err.response?.data?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Welcome back! Please login.</Text>

      <Input
        label="Username"
        placeholder="Enter username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <Input
        label="Password"
        placeholder="Enter password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.forgotLink} onPress={onNavigateForgot}>
        <Text style={styles.linkText}>Forgot password?</Text>
      </TouchableOpacity>

      <Button title="Login" onPress={handleLogin} isLoading={isLoading} style={styles.button} />

      <View style={styles.googleContainer}>
        <View style={styles.dividerContainer}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.divider} />
        </View>
        <Button
          title="Continue with Google"
          onPress={() => promptAsync()}
          isLoading={isLoading && !username}
          disabled={!request}
          style={styles.googleButton}
        />
      </View>

      <View style={styles.bottomLinks}>
        <View style={styles.row}>
          <Text style={styles.text}>Don't have an account? </Text>
          <TouchableOpacity onPress={onNavigateRegister}>
            <Text style={styles.linkText}>Register now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    marginTop: 16,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  bottomLinks: {
    marginTop: 24,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  text: {
    color: COLORS.textSecondary,
  },
  googleContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.surfaceBorder,
  },
  dividerText: {
    color: COLORS.textMuted,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  googleButton: {
    backgroundColor: '#db4437',
    width: '100%',
  },
});
