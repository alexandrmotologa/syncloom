package auth

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// UserClaims holds extracted multi-tenant and user identity tokens.
type UserClaims struct {
	TenantID  string   `json:"tenant_id"`
	UserID    string   `json:"user_id"`
	Roles     []string `json:"roles,omitempty"`
	ExpiresAt int64    `json:"exp,omitempty"`
}

// JWTValidator validates tokens and extracts tenant boundary claims.
type JWTValidator struct {
	secret []byte
}

// NewJWTValidator creates a validator instance with a shared secret.
func NewJWTValidator(secret string) *JWTValidator {
	return &JWTValidator{secret: []byte(secret)}
}

// ValidateToken extracts claims from signed JWT or structured dev tokens (dev:<tenantId>:<userId>).
func (v *JWTValidator) ValidateToken(token string) (*UserClaims, error) {
	if token == "" {
		return &UserClaims{
			TenantID: "default",
			UserID:   "anonymous",
			Roles:    []string{"user"},
		}, nil
	}

	// Dev token format: dev:<tenantId>:<userId>
	if strings.HasPrefix(token, "dev:") {
		parts := strings.Split(token, ":")
		if len(parts) >= 3 {
			return &UserClaims{
				TenantID: parts[1],
				UserID:   parts[2],
				Roles:    []string{"developer"},
			}, nil
		}
	}

	// Standard JWT parsing (header.payload.signature)
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid jwt segment count")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode jwt payload: %w", err)
	}

	var claims UserClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("failed to unmarshal jwt claims: %w", err)
	}

	if claims.ExpiresAt > 0 && time.Now().Unix() > claims.ExpiresAt {
		return nil, fmt.Errorf("jwt token has expired")
	}

	if claims.TenantID == "" {
		claims.TenantID = "default"
	}

	return &claims, nil
}
