import React from 'react';
import {ActivityIndicator, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {colors} from '../theme/colors';
import {strings} from '../theme/strings';
import {useSession} from '../state/SessionContext';
import {LoginScreen} from '../screens/LoginScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {ContentSyncScreen} from '../screens/ContentSyncScreen';
import {SupportScreen} from '../screens/SupportScreen';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  ContentSync: undefined;
  Support: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.value,
        tabBarStyle: {height: 50, backgroundColor: colors.tab},
        tabBarLabelStyle: {fontSize: 12}
      }}>
      <Tabs.Screen name="Home" component={HomeScreen} options={{title: strings.home}} />
      <Tabs.Screen name="ContentSync" component={ContentSyncScreen} options={{title: strings.usbSync}} />
      <Tabs.Screen name="Support" component={SupportScreen} options={{title: strings.support}} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const session = useSession();

  if (session.booting) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      {session.isLoggedIn ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
