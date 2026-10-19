import React from "react";
import { Text, View } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as LocalAuthentication from "expo-local-authentication";

import { SecurityProvider, useSecurity } from "../hooks/use-security";
import * as SecurityService from "../services/security";
import type { SecurityAuthReason } from "../types/security";

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

jest.mock("../services/security", () => ({
  getSecuritySettings: jest.fn(),
  hasFallbackPin: jest.fn(),
  isBiometricSessionValid: jest.fn(),
  recordBiometricAuth: jest.fn(),
  verifyFallbackPin: jest.fn(),
}));

jest.mock("@/components/security/pin-auth-modal", () => {
  const React = require("react");
  const { Text, TextInput, View } = require("react-native");

  return {
    PinAuthModal: ({ visible, pin, onPinChange, onSubmit }: any) =>
      visible
        ? React.createElement(
            View,
            null,
            React.createElement(TextInput, {
              testID: "pin-input",
              value: pin,
              onChangeText: onPinChange,
            }),
            React.createElement(
              Text,
              { testID: "submit-pin", onPress: onSubmit },
              "Verify PIN",
            ),
          )
        : null,
  };
});

describe("PIN authentication reason tracking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecurityService.getSecuritySettings as jest.Mock).mockResolvedValue({
      biometricLockEnabled: true,
      sessionTimeoutMinutes: 5,
    });
    (SecurityService.hasFallbackPin as jest.Mock).mockResolvedValue(true);
    (SecurityService.isBiometricSessionValid as jest.Mock).mockResolvedValue(
      false,
    );
    (SecurityService.verifyFallbackPin as jest.Mock).mockResolvedValue(true);
    (SecurityService.recordBiometricAuth as jest.Mock).mockResolvedValue(
      undefined,
    );
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
      success: false,
      error: "user_cancel",
    });
  });

  it.each<SecurityAuthReason>([
    "session_expired",
    "payment_authorization",
    "sensitive_data_access",
  ])("records %s after successful PIN re-authentication", async (reason) => {
    let authentication: Promise<boolean> | undefined;

    const TestConsumer = () => {
      const security = useSecurity();
      return (
        <View>
          <Text testID="ready">{security.isReady ? "yes" : "no"}</Text>
          <Text
            testID="authenticate"
            onPress={() => {
              authentication = security.authenticateForSensitiveAction(reason);
            }}
          >
            Authenticate
          </Text>
        </View>
      );
    };

    await render(
      <SecurityProvider>
        <TestConsumer />
      </SecurityProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").props.children).toBe("yes");
    });

    await fireEvent.press(screen.getByTestId("authenticate"));
    await screen.findByTestId("pin-input");

    await fireEvent.changeText(screen.getByTestId("pin-input"), "1234");
    await waitFor(() => {
      expect(screen.getByTestId("pin-input").props.value).toBe("1234");
    });

    await fireEvent.press(screen.getByTestId("submit-pin"));
    await expect(authentication).resolves.toBe(true);

    expect(SecurityService.recordBiometricAuth).toHaveBeenCalledWith(reason);
  });
});
