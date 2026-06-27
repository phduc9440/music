import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { authApi } from '../../../services';
import { Input } from '../../../components/Input';
import { Button } from '../../../components/Button';
import { COLORS } from '../../../constants/colors';

interface Props {
  onRegisterSuccess: () => void;
  onNavigateLogin: () => void;
}

export const RegisterForm = ({ onRegisterSuccess, onNavigateLogin }: Props) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async () => {
    if (!username || !password || !email || !fullName) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.register({ username, password, email, fullName });
      Alert.alert('Success', 'Registration successful! Please login.');
      onRegisterSuccess();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      Alert.alert('Error', err.response?.data?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Create a new account.</Text>

      <Input
        label="Email"
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Input
        label="Full Name"
        placeholder="Enter your full name"
        value={fullName}
        onChangeText={setFullName}
      />

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

      <Button title="Register" onPress={handleRegister} isLoading={isLoading} style={styles.button} />

      <View style={styles.bottomLinks}>
        <View style={styles.row}>
          <Text style={styles.text}>Already have an account? </Text>
          <TouchableOpacity onPress={onNavigateLogin}>
            <Text style={styles.linkText}>Login now</Text>
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
});
