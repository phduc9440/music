import React, { useState } from 'react';
import { Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS } from '../constants/colors';

import { LoginForm } from '../features/auth/components/LoginForm';
import { RegisterForm } from '../features/auth/components/RegisterForm';
import { ForgotPasswordForm } from '../features/auth/components/ForgotPasswordForm';
import { ResetPasswordForm } from '../features/auth/components/ResetPasswordForm';

type ViewMode = 'login' | 'register' | 'forgot' | 'reset';

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

export default function LoginScreen({ navigation }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('login');
  const [forgotEmail, setForgotEmail] = useState('');

  const handleLoginSuccess = (role: 'USER' | 'ADMIN') => {
    if (role === 'USER') {
      navigation.replace('User');
    } else {
      navigation.replace('Admin');
    }
  };

  const renderForm = () => {
    switch (viewMode) {
      case 'login':
        return (
          <LoginForm
            onLoginSuccess={handleLoginSuccess}
            onNavigateRegister={() => setViewMode('register')}
            onNavigateForgot={() => setViewMode('forgot')}
          />
        );
      case 'register':
        return (
          <RegisterForm
            onRegisterSuccess={() => setViewMode('login')}
            onNavigateLogin={() => setViewMode('login')}
          />
        );
      case 'forgot':
        return (
          <ForgotPasswordForm
            onForgotSuccess={(email) => {
              setForgotEmail(email);
              setViewMode('reset');
            }}
            onNavigateLogin={() => setViewMode('login')}
          />
        );
      case 'reset':
        return (
          <ResetPasswordForm
            initialEmail={forgotEmail}
            onResetSuccess={() => setViewMode('login')}
            onNavigateLogin={() => setViewMode('login')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Music App</Text>
          {renderForm()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.accent,
    textAlign: 'center',
    marginBottom: 8,
  },
});

