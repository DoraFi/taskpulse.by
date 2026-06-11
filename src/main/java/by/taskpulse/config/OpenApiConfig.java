package by.taskpulse.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    private static final String BEARER_SCHEME = "bearerAuth";

    @Bean
    public OpenAPI taskpulseOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("TaskPulse API")
                        .description("""
                                REST API веб-приложения TaskPulse.
                                Для вызова защищённых методов: POST /api/auth/login, скопируйте поле token
                                из ответа и нажмите Authorize → Bearer <token>.
                                """)
                        .version("v1")
                        .contact(new Contact().name("TaskPulse")))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME))
                .components(new Components()
                        .addSecuritySchemes(BEARER_SCHEME, new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("JWT из POST /api/auth/login (поле token) или cookie TP_AUTH")));
    }
}
