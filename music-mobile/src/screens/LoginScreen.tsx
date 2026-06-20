import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, userApi, adminApi } from '../api';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { COLORS } from '../constants/colors';

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

export default function LoginScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter username and password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.login({ username, password });
      const token = response.data.result.token;
      await AsyncStorage.setItem('token', token);
      
      try {
        await userApi.getMe();
        await AsyncStorage.setItem('role', 'USER');
        navigation.replace('User');
      } catch (err) {
        try {
          await adminApi.getMe();
          await AsyncStorage.setItem('role', 'ADMIN');
          navigation.replace('Admin');
        } catch (err2) {
          Alert.alert('Error', 'Could not fetch profile.');
        }
      }
    } catch (error: any) {
      Alert.alert('Login Failed', error.response?.data?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Music App</Text>
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

        <Button 
          title="Login" 
          onPress={handleLogin} 
          isLoading={isLoading} 
          style={styles.button} 
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
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
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    marginTop: 16,
  },
});
