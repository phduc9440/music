import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { authApi } from '../../../services';
import { Input } from '../../../components/Input';
import { Button } from '../../../components/Button';
import { COLORS } from '../../../constants/colors';

interface Props {
  initialEmail: string;
  onResetSuccess: () => void;
  onNavigateLogin: () => void;
}

export const ResetPasswordForm = ({ initialEmail, onResetSuccess, onNavigateLogin }: Props) => {
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleReset = async () => {
    if (!email || !otp || !newPassword) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.resetPassword({ email, otp, newPassword });
      Alert.alert('Success', 'Password has been reset successfully! Please login.');
      onResetSuccess();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      Alert.alert('Error', err.response?.data?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Enter OTP and new password.</Text>

      <Input
        label="Email"
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={false}
      />

      <Input
        label="OTP Code"
        placeholder="Enter 6-digit OTP"
        value={otp}
        onChangeText={setOtp}
        keyboardType="number-pad"
        maxLength={6}
      />

      <Input
        label="New Password"
        placeholder="Enter new password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
      />

      <Button title="Reset Password" onPress={handleReset} isLoading={isLoading} style={styles.button} />

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
