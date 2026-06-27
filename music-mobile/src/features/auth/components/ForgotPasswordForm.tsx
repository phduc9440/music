import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { authApi } from '../../../services';
import { Input } from '../../../components/Input';
import { Button } from '../../../components/Button';
import { COLORS } from '../../../constants/colors';

interface Props {
  onForgotSuccess: (email: string) => void;
  onNavigateLogin: () => void;
}

export const ForgotPasswordForm = ({ onForgotSuccess, onNavigateLogin }: Props) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleForgot = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.forgotPassword({ email });
      Alert.alert('Success', 'OTP has been sent to your email.');
      onForgotSuccess(email);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      Alert.alert('Error', err.response?.data?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Enter email to receive OTP.</Text>

      <Input
        label="Email"
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Button title="Send OTP" onPress={handleForgot} isLoading={isLoading} style={styles.button} />

      <View style={styles.bottomLinks}>
        <View style={styles.row}>
          <Text style={styles.text}>Remember your password? </Text>
          <TouchableOpacity onPress={onNavigateLogin}>
            <Text style={styles.linkText}>Back to Login</Text>
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
