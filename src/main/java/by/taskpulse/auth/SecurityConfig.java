package by.taskpulse.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {
    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final AuthExceptionHandlers authExceptionHandlers;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                          AuthExceptionHandlers authExceptionHandlers) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.authExceptionHandlers = authExceptionHandlers;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/auth/**",
                                "/onboarding/**",
                                "/api/auth/**",
                                "/error",
                                "/favicon.ico",
                                "/static/**",
                                "/swagger-ui/**",
                                "/swagger-ui.html",
                                "/v3/api-docs/**",
                                "/templates/pages/auth_*.html",
                                "/templates/pages/onboarding_*.html"
                        ).permitAll()
                        .requestMatchers(HttpMethod.GET, "/templates/components/*.html").authenticated()
                        .requestMatchers("/", "/o/**", "/api/**", "/templates/**").authenticated()
                        .anyRequest().permitAll()
                )
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authExceptionHandlers)
                        .accessDeniedHandler(authExceptionHandlers))
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
