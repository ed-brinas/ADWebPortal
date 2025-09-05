var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Configure the HTTP request pipeline.
app.UseDefaultFiles(); // This will serve index.html by default
app.UseStaticFiles(); // This enables serving files from wwwroot

app.Run();

