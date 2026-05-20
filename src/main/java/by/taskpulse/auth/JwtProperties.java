package by.taskpulse.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.jwt")
public class JwtProperties {
    private String secret;
    /** Срок сессии после входа без «Запомнить меня» (по умолчанию 7 суток). */
    private long expirationMinutes = 10080;
    /** Срок при включённом «Запомнить меня» (по умолчанию 30 суток). */
    private long rememberExpirationMinutes = 43200;

    public String getSecret() {
        return secret;
    }

    public void setSecret(String secret) {
        this.secret = secret;
    }

    public long getExpirationMinutes() {
        return expirationMinutes;
    }

    public void setExpirationMinutes(long expirationMinutes) {
        this.expirationMinutes = expirationMinutes;
    }

    public long getRememberExpirationMinutes() {
        return rememberExpirationMinutes;
    }

    public void setRememberExpirationMinutes(long rememberExpirationMinutes) {
        this.rememberExpirationMinutes = rememberExpirationMinutes;
    }
}
